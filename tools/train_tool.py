"""RailRadar timetable and indicative fare lookup; RailRadar does not issue tickets."""
from __future__ import annotations

import logging
import os
import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import certifi
import requests
from dotenv import load_dotenv

from services.result_cache import configured_ttl, result_cache

load_dotenv()

logger = logging.getLogger("tripmate.trains")
RAILRADAR_API_KEY = os.getenv("RAILRADAR_API_KEY", "").strip()
RAILRADAR_BASE_URL = "https://api.railradar.in/v1"
REQUEST_TIMEOUT_SECONDS = 8

# Goa is a state/region, not one station. RailRadar's substring autocomplete
# can confuse "Goa" with station code GOA (Gohad Road), so resolve the region
# through its major passenger stations instead of accepting that false match.
# Codes are still fetched from RailRadar; only the human-readable search terms
# are listed here.
REGION_STATION_SEARCHES = {
    "goa": ("Madgaon", "Thivim", "Karmali", "Vasco da Gama"),
}


class RailRadarError(RuntimeError):
    """A safe, user-displayable train provider error."""


def _request_json(path: str, params: dict[str, str]) -> dict[str, Any]:
    if not RAILRADAR_API_KEY:
        raise RailRadarError("Train schedules are unavailable: configure RAILRADAR_API_KEY to enable RailRadar.")
    try:
        response = requests.get(
            f"{RAILRADAR_BASE_URL}/{path.lstrip('/')}",
            headers={"Authorization": f"Bearer {RAILRADAR_API_KEY}"},
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
            verify=certifi.where(),
        )
    except requests.Timeout as exc:
        raise RailRadarError("RailRadar train search timed out. Please try again later.") from exc
    except requests.RequestException as exc:
        raise RailRadarError("RailRadar could not be reached. Train schedules are unavailable right now.") from exc

    if response.status_code == 404:
        return {"success": True, "data": {"trains": []}}
    if response.status_code == 401:
        raise RailRadarError("RailRadar rejected the API key. Check RAILRADAR_API_KEY in your environment.")
    if response.status_code == 429:
        raise RailRadarError("RailRadar rate limit reached. Try again after the provider quota resets.")
    if response.status_code >= 500:
        raise RailRadarError("RailRadar is temporarily unavailable. Please try again later.")
    if not response.ok:
        raise RailRadarError(f"RailRadar rejected the request (HTTP {response.status_code}).")
    try:
        payload = response.json()
    except ValueError as exc:
        raise RailRadarError("RailRadar returned an unreadable response.") from exc
    if not isinstance(payload, dict) or payload.get("success") is False:
        error = payload.get("error") if isinstance(payload, dict) else None
        message = error.get("message") if isinstance(error, dict) else None
        raise RailRadarError(str(message or "RailRadar could not complete this lookup.")[:240])
    return payload


def _normalized(value: str) -> str:
    return " ".join(str(value or "").casefold().replace(",", " ").split())


def _station_candidates(query: str) -> list[dict[str, str]]:
    normalized = _normalized(query)
    if not normalized:
        return []

    def load() -> list[dict[str, str]]:
        payload = _request_json("lookup/search/stations", {"q": query.strip(), "limit": "50"})
        raw = payload.get("data")
        if not isinstance(raw, list):
            return []
        candidates = []
        for item in raw:
            if not isinstance(item, dict) or not item.get("code") or not item.get("name"):
                continue
            candidates.append({
                "code": str(item["code"]).strip().upper(),
                "name": str(item["name"]).strip(),
                "city": str(item.get("city") or "").strip(),
            })
        return candidates

    value, _ = result_cache.get_or_load(
        # v2 avoids keeping old low-limit autocomplete responses that can omit
        # a city's principal station and incorrectly trigger ambiguity.
        "railradar-station-search-v2",
        {"query": normalized},
        configured_ttl("TRAIN_STATION_CACHE_TTL_SECONDS", 604800, maximum=2_592_000),
        load,
        should_cache=lambda result: isinstance(result, list),
    )
    return value if isinstance(value, list) else []


def resolve_station(query: str) -> tuple[dict[str, str], bool]:
    """Resolve an explicit station/city without silently choosing a random match.

    Returns (station, by_city); the provider's byCity option can then account for
    other stations in that metro area.
    """
    if _normalized(query) in REGION_STATION_SEARCHES:
        return resolve_station_options(query)[0]
    try:
        candidates = _station_candidates(query)
    except RailRadarError as exc:
        if "multiple stations" not in str(exc).casefold():
            raise
        # Some provider versions fail autocomplete for a metro name instead
        # of returning its station list. Retry narrower, common station-name
        # forms and use the provider's result automatically.
        variants = (f"New {query.strip()}", f"{query.strip()} Junction", f"{query.strip()} Central", f"{query.strip()} Cantt")
        for variant in variants:
            try:
                narrowed = _station_candidates(variant)
            except RailRadarError:
                continue
            if not narrowed:
                continue
            exact = [item for item in narrowed if _normalized(item["name"]) == _normalized(variant)]
            selected = exact[0] if exact else narrowed[0]
            logger.info("provider=RailRadar station_resolution=automatic_variant query=%s variant=%s code=%s", query, variant, selected["code"])
            return selected, True
        raise RailRadarError(f"RailRadar could not automatically resolve a main station for '{query}'.") from exc
    if not candidates:
        raise RailRadarError(f"No railway station matched '{query}'. Try a nearby station name or code.")
    needle = _normalized(query)
    code_matches = [item for item in candidates if item["code"].casefold() == needle]
    if len(code_matches) == 1 and query.strip().isupper():
        return code_matches[0], False

    name_matches = [item for item in candidates if _normalized(item["name"]) == needle]
    if len(name_matches) == 1:
        return name_matches[0], False

    def central_rank(item: dict[str, str]) -> int:
        name = _normalized(item["name"])
        if not name.startswith(f"{needle} "):
            return 0
        suffix = name[len(needle):].strip()
        if suffix in {"junction", "jn", "j n", "central", "cantt", "cantonment"}:
            return 3
        if suffix.startswith(("junction ", "jn ", "central ", "cantt ", "cantonment ")):
            return 2
        return 1

    def relevance(item: dict[str, str]) -> tuple[int, int]:
        name = _normalized(item["name"])
        city = _normalized(item["city"])
        # Prefer a city-rooted principal station (Agra Cantt, Jaipur Junction),
        # then exact city/name matches, then the provider's ranked results.
        if central_rank(item) >= 2:
            score = 120 + central_rank(item)
        elif name == needle:
            score = 115
        elif city == needle:
            score = 110
        elif name.startswith(f"{needle} "):
            score = 95
        elif needle in name or needle in city:
            score = 70
        else:
            score = 10
        return score, -candidates.index(item)

    selected = max(candidates, key=relevance)
    exact_station = _normalized(selected["name"]) == needle
    exact_code = selected["code"].casefold() == needle and query.strip().isupper()
    # City searches are expanded across the provider's metro area. If the
    # autocomplete still returns several stations, use its relevance ranking
    # and select the main station automatically rather than asking the traveler.
    return selected, not (exact_station or exact_code)


def resolve_station_options(query: str) -> list[tuple[dict[str, str], bool]]:
    """Resolve a city/region query to one or more provider-verified stations."""
    aliases = REGION_STATION_SEARCHES.get(_normalized(query))
    if not aliases:
        return [resolve_station(query)]

    resolved: list[tuple[dict[str, str], bool]] = []
    seen_codes: set[str] = set()
    for station_query in aliases:
        try:
            station, by_city = resolve_station(station_query)
        except RailRadarError:
            # A provider may not index every regional station; continue with
            # the stations it does resolve rather than failing the whole route.
            continue
        if station["code"] not in seen_codes:
            seen_codes.add(station["code"])
            resolved.append((station, by_city))
    if not resolved:
        raise RailRadarError(f"No RailRadar stations could be resolved for '{query}'. Try a specific station name or code.")
    return resolved


def _duration_label(minutes: Any) -> str | None:
    try:
        value = int(minutes)
    except (TypeError, ValueError):
        return None
    if value <= 0 or value > 72 * 60:
        return None
    return f"{value // 60}h {value % 60}m"


def _train_fare(train: dict[str, Any], travel_date: str, class_code: str = "SL") -> dict[str, Any] | None:
    """Fetch a provider fare quote for one train/class; never estimate a fare locally."""
    number = str(train.get("train_number") or "").strip()
    source = str(train.get("departure_station_code") or "").strip().upper()
    destination = str(train.get("arrival_station_code") or "").strip().upper()
    if not (number and source and destination):
        return None
    params = {
        "source": source,
        "destination": destination,
        "journeyDate": travel_date,
        "classCode": class_code,
        "quotaCode": "GN",
    }

    def load() -> dict[str, Any] | None:
        payload = _request_json(f"trains/{quote(number, safe='')}/fare", params)
        data = payload.get("data")
        breakdown = data.get("breakdown") if isinstance(data, dict) else None
        if not isinstance(data, dict) or not isinstance(breakdown, dict):
            return {"_fare_unavailable": True}
        total = breakdown.get("totalFare")
        if isinstance(total, bool) or not isinstance(total, (int, float)) or total <= 0:
            return {"_fare_unavailable": True}
        normalized_breakdown = {
            key: value for key, value in breakdown.items()
            if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0
        }
        identity = json.dumps({"train": number, **params, "total": total}, sort_keys=True)
        return {
            "quote_id": f"RR-{hashlib.sha256(identity.encode()).hexdigest()[:20].upper()}",
            "provider": "RailRadar",
            "quote_type": "PROVIDER_FARE_ESTIMATE",
            "status": "FARE_RETURNED",
            "currency": "INR",
            "amount_minor": int(round(float(total) * 100)),
            "amount": float(total),
            "train_number": number,
            "source_station_code": source,
            "destination_station_code": destination,
            "travel_date": travel_date,
            "class_code": class_code,
            "quota_code": "GN",
            "breakdown": normalized_breakdown,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "bookable": False,
            "note": "Provider fare quote only. Seat availability, reservation, payment, and ticket issuance are not confirmed.",
        }

    quote_result, _ = result_cache.get_or_load(
        "railradar-train-fare-v1",
        {"train": number, **params},
        configured_ttl("TRAIN_FARE_CACHE_TTL_SECONDS", 900, maximum=3600),
        load,
        should_cache=lambda result: isinstance(result, dict),
    )
    return quote_result if isinstance(quote_result, dict) and not quote_result.get("_fare_unavailable") else None


def _parse_train_rows(payload: dict[str, Any], *, origin: dict[str, str], destination: dict[str, str], travel_date: str) -> list[dict[str, Any]]:
    data = payload.get("data")
    rows = data.get("trains") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return []
    from_info = data.get("from") if isinstance(data.get("from"), dict) else {}
    to_info = data.get("to") if isinstance(data.get("to"), dict) else {}
    trains: list[dict[str, Any]] = []
    for row in rows[:10]:
        if not isinstance(row, dict):
            continue
        train = row.get("train") if isinstance(row.get("train"), dict) else {}
        from_schedule = row.get("from") if isinstance(row.get("from"), dict) else {}
        to_schedule = row.get("to") if isinstance(row.get("to"), dict) else {}
        number = str(train.get("number") or "").strip()
        name = str(train.get("name") or "").strip()
        departure = str(from_schedule.get("departure") or "").strip()
        arrival = str(to_schedule.get("arrival") or "").strip()
        if not number or not name or not departure or not arrival:
            continue
        duration_minutes = row.get("duration") if isinstance(row.get("duration"), int) else None
        trains.append({
            "name": name,
            "train_name": name,
            "train_number": number,
            "departure_station": str(from_info.get("name") or origin["name"]),
            "arrival_station": str(to_info.get("name") or destination["name"]),
            "departure_station_code": str(from_info.get("code") or origin["code"]),
            "arrival_station_code": str(to_info.get("code") or destination["code"]),
            "departure_time": departure,
            "arrival_time": arrival,
            "duration": _duration_label(row.get("duration")),
            "duration_minutes": duration_minutes,
            "travel_date": travel_date,
            "run_days": train.get("runDays") if isinstance(train.get("runDays"), list) else [],
            "distance_km": row.get("distance") if isinstance(row.get("distance"), (int, float)) else None,
            "status": "SCHEDULE_ONLY",
            "source": "RailRadar",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "price_note": "Schedule data only. Fare, seat availability, booking, and ticket issuance are not provided by this result.",
        })
    trains.sort(key=lambda item: int(item.get("duration_minutes") or 1_000_000))
    for train in trains:
        train.pop("duration_minutes", None)
    return trains


def search_trains(origin: str, destination: str, travel_date: str, limit: int = 5) -> dict[str, Any]:
    """Return live timetable schedules or a clear unavailable/no-results state."""
    if not RAILRADAR_API_KEY:
        return {"trains": [], "status": "UNAVAILABLE", "message": "Train schedules are not configured. Add RAILRADAR_API_KEY to enable RailRadar search."}
    try:
        parsed_date = date.fromisoformat(str(travel_date))
    except (TypeError, ValueError):
        return {"trains": [], "status": "UNAVAILABLE", "message": "A valid travel date is required for train search."}
    try:
        origin_stations = resolve_station_options(origin)
        destination_stations = resolve_station_options(destination)
        route_pairs = [
            (from_station, to_station, from_by_city or to_by_city)
            for from_station, from_by_city in origin_stations
            for to_station, to_by_city in destination_stations
            if from_station["code"] != to_station["code"]
        ]
        if not route_pairs:
            return {"trains": [], "status": "NO_RESULTS", "message": "Origin and destination resolve to the same railway station."}

        def schedules_for_date(search_date: date) -> list[dict[str, Any]]:
            matched: list[dict[str, Any]] = []
            seen: set[tuple[str, str, str, str, str]] = set()
            for from_station, to_station, by_city in route_pairs:
                params = {
                    "date": search_date.isoformat(),
                    "byCity": "true" if by_city else "false",
                    "live": "false",
                }

                def load() -> list[dict[str, Any]]:
                    path = f"trains/between/{quote(from_station['code'], safe='')}/{quote(to_station['code'], safe='')}"
                    try:
                        payload = _request_json(path, params)
                    except RailRadarError as exc:
                        # RailRadar may reject metro expansion when a city has
                        # several stations. Retry using the already-resolved
                        # provider station codes, so the traveler never has to
                        # disambiguate a station manually.
                        ambiguity = "multiple stations" in str(exc).casefold()
                        if not (by_city and ambiguity):
                            raise
                        exact_params = {**params, "byCity": "false"}
                        logger.info(
                            "provider=RailRadar city_expansion=ambiguous retry=station_codes from=%s to=%s",
                            from_station["code"], to_station["code"],
                        )
                        payload = _request_json(path, exact_params)
                    return _parse_train_rows(payload, origin=from_station, destination=to_station, travel_date=search_date.isoformat())

                trains, _ = result_cache.get_or_load(
                    "railradar-trains-between-v1",
                    {"origin": from_station["code"], "destination": to_station["code"], **params},
                    configured_ttl("TRAIN_SCHEDULE_CACHE_TTL_SECONDS", 21600, maximum=86400),
                    load,
                    should_cache=lambda result: isinstance(result, list),
                )
                if not isinstance(trains, list):
                    continue
                for train in trains:
                    key = (
                        str(train.get("train_number") or ""),
                        str(train.get("departure_station_code") or ""),
                        str(train.get("arrival_station_code") or ""),
                        str(train.get("departure_time") or ""),
                        str(train.get("arrival_time") or ""),
                    )
                    if key not in seen:
                        seen.add(key)
                        matched.append(train)
            return matched

        matched_trains = schedules_for_date(parsed_date)
        suggested_dates: list[str] = []
        if not matched_trains:
            # If the requested day has no provider schedules, check the nearest
            # days on both sides. Stop at the first distance with any results;
            # this limits extra quota use and keeps suggestions genuinely near.
            for offset in range(1, 4):
                nearby: list[dict[str, Any]] = []
                for direction in (-1, 1):
                    try:
                        candidate_date = parsed_date + timedelta(days=direction * offset)
                        day_results = schedules_for_date(candidate_date)
                    except OverflowError:
                        continue
                    if day_results:
                        suggested_dates.append(candidate_date.isoformat())
                        nearby.extend(day_results)
                if nearby:
                    matched_trains = nearby
                    break

        limit_count = max(1, min(int(limit), 10))
        if suggested_dates:
            # Keep at least one card for each nearest date in the UI before
            # filling the remaining slots with additional provider results.
            limited = []
            for candidate_day in suggested_dates:
                first_for_day = next((item for item in matched_trains if item.get("travel_date") == candidate_day), None)
                if first_for_day is not None and first_for_day not in limited:
                    limited.append(first_for_day)
            limited.extend(item for item in matched_trains if item not in limited)
            limited = limited[:limit_count]
        else:
            limited = matched_trains[:limit_count]
        if not limited:
            route_scope = " across the resolved regional stations" if len(route_pairs) > 1 else ""
            return {"trains": [], "status": "NO_RESULTS", "message": f"RailRadar returned no schedules{route_scope} for {parsed_date.isoformat()} or within 3 days before or after. Try a nearby travel date."}
        # Attach an actual RailRadar fare quote for the default Sleeper class.
        # Only the final displayed rows are queried, limiting API usage; the
        # result cache prevents repeated fare calls for the same journey.
        fare_provider_paused = False
        for train in limited:
            fare = None
            if not fare_provider_paused:
                try:
                    fare = _train_fare(train, str(train.get("travel_date") or parsed_date.isoformat()))
                except RailRadarError as exc:
                    # A provider quota/network outage should not erase schedule
                    # results or trigger the same failing request for every row.
                    logger.info("provider=RailRadar fare_status=unavailable train=%s reason=%s", train.get("train_number"), exc)
                    fare_provider_paused = any(term in str(exc).casefold() for term in ("rate limit", "temporarily unavailable", "timed out", "could not be reached"))
            if fare:
                # Preserve a structured, provider-sourced quote for a future
                # booking integration. It is deliberately marked non-bookable:
                # fares alone do not reserve seats or issue railway tickets.
                train["fare"] = fare
                train["quote"] = fare
                train["price"] = fare["amount"]
                train["price_num"] = fare["amount"]
                train["price_note"] = fare["note"]
            else:
                train["fare"] = None
                train["price_note"] = ("RailRadar fare service is temporarily unavailable. No fare has been estimated." if fare_provider_paused
                                        else "RailRadar did not return a fare quote for Sleeper (SL). No fare has been estimated.")
        if suggested_dates:
            return {
                "trains": limited,
                "status": "SUGGESTIONS_RETURNED",
                "message": f"No trains were returned for {parsed_date.isoformat()}. Nearest available schedule date(s): {', '.join(suggested_dates)}.",
                "requested_date": parsed_date.isoformat(),
                "suggested_dates": suggested_dates,
                "fare_lookup_status": "COMPLETED",
            }
        return {"trains": limited, "status": "SCHEDULES_RETURNED", "message": None, "fare_lookup_status": "COMPLETED"}
    except RailRadarError as exc:
        logger.info("provider=RailRadar status=unavailable reason=%s", exc)
        return {"trains": [], "status": "UNAVAILABLE", "message": str(exc)}
    except (ValueError, TypeError) as exc:
        logger.warning("provider=RailRadar status=invalid_response error=%s", exc)
        return {"trains": [], "status": "UNAVAILABLE", "message": "RailRadar returned train data that could not be read."}


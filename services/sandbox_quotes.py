from __future__ import annotations

import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Any


def _positive_int_env(name: str, default: int, maximum: int = 100_000) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(1, min(value, maximum))


def create_sandbox_hotel_quote(
    *,
    hotel: dict[str, Any],
    destination: str,
    check_in: str,
    check_out: str,
    nights: int,
    travelers: int,
    accommodation: str | None,
) -> dict[str, Any]:
    """Create a reproducible test quote for the local simulated inventory.

    These are sandbox amounts, never supplier rates. The quote is stable for the
    same property, trip dates, party size, and rate policy to make retries safe.
    """
    nights = max(1, int(nights))
    travelers = max(1, int(travelers))
    rooms = (travelers + 1) // 2
    base_nightly = _positive_int_env("SANDBOX_HOTEL_BASE_NIGHTLY_INR", 4200)
    spread = min(30, _positive_int_env("SANDBOX_HOTEL_RATE_SPREAD_PERCENT", 18))
    hotel_name = str(hotel.get("name") or "Accommodation").strip()
    style = (accommodation or "mid-range").casefold()
    if "budget" in style:
        category_percent = 75
    elif "boutique" in style or "luxury" in style:
        category_percent = 140
    else:
        category_percent = 100

    key = "|".join((destination.casefold(), hotel_name.casefold(), check_in, check_out, str(travelers), style))
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    adjustment = int(digest[:8], 16) % (spread * 2 + 1) - spread
    nightly = int(round(base_nightly * category_percent * (100 + adjustment) / 10_000 / 100) * 100)
    nightly = max(500, nightly)
    total = nightly * nights * rooms
    quote_id = f"SQ-{hashlib.sha256((key + '|quote').encode('utf-8')).hexdigest()[:14].upper()}"
    now = datetime.now(timezone.utc)
    return {
        "quote_id": quote_id,
        "provider": "TripMate sandbox inventory",
        "quote_type": "SANDBOX",
        "currency": "INR",
        "nightly_rate_minor": nightly * 100,
        "amount_minor": total * 100,
        "nights": nights,
        "rooms": rooms,
        "travelers": travelers,
        "check_in": check_in,
        "check_out": check_out,
        "expires_at": (now + timedelta(minutes=15)).isoformat(),
    }


def create_sandbox_cab_quote(*, name: str, route: str, travel_date: str) -> dict[str, Any]:
    """Return a fixed catalog quote from the local simulated transport inventory."""
    catalog = {"Local Sedan Transfer": 1800, "Local SUV Transfer": 2800, "Local Van Transfer": 3600}
    price = catalog.get(name)
    if price is None:
        raise ValueError("Unknown sandbox transport option.")
    key = f"cab|{name.casefold()}|{route.casefold()}|{travel_date}"
    quote_id = f"CQ-{hashlib.sha256(key.encode('utf-8')).hexdigest()[:14].upper()}"
    return {"quote_id": quote_id, "provider": "TripMate sandbox transport inventory", "quote_type": "SANDBOX",
            "currency": "INR", "amount_minor": price * 100, "travel_date": travel_date,
            "route": route, "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}

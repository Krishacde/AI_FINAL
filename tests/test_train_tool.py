from __future__ import annotations

import unittest
from unittest.mock import patch

from services.result_cache import ResultCache
from tools import train_tool


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.ok = status_code < 400

    def json(self):
        return self._payload


class RailRadarToolTests(unittest.TestCase):
    def setUp(self):
        self.cache = ResultCache(redis_url="")
        self.cache_patch = patch.object(train_tool, "result_cache", self.cache)
        self.cache_patch.start()
        self.key_patch = patch.object(train_tool, "RAILRADAR_API_KEY", "test-key")
        self.key_patch.start()

    def tearDown(self):
        self.key_patch.stop()
        self.cache_patch.stop()

    def test_missing_key_returns_unavailable_without_provider_request(self):
        with patch.object(train_tool, "RAILRADAR_API_KEY", ""), patch.object(train_tool.requests, "get") as get:
            result = train_tool.search_trains("Delhi", "Agra", "2026-12-01")
        get.assert_not_called()
        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertEqual(result["trains"], [])

    def test_provider_schedules_are_cached_and_never_invent_fares(self):
        def get(url, **kwargs):
            if "lookup/search/stations" in url:
                query = kwargs["params"]["q"]
                station = {"Delhi": {"code": "NDLS", "name": "New Delhi", "city": "Delhi"},
                           "Agra": {"code": "AGC", "name": "Agra Cantt", "city": "Agra"}}[query]
                return FakeResponse({"success": True, "data": [station]})
            if url.endswith("/fare"):
                return FakeResponse({"success": True, "data": {"breakdown": {
                    "baseFare": 200, "reservationCharge": 20, "totalFare": 220,
                }}})
            return FakeResponse({"success": True, "data": {
                "from": {"code": "NDLS", "name": "New Delhi"},
                "to": {"code": "AGC", "name": "Agra Cantt"},
                "trains": [{"train": {"number": "12002", "name": "Example Express", "runDays": ["mon"]},
                            "from": {"departure": "06:00"}, "to": {"arrival": "08:00"},
                            "duration": 120, "distance": 195.4}],
            }})

        with patch.object(train_tool.requests, "get", side_effect=get) as request:
            result = train_tool.search_trains("Delhi", "Agra", "2026-12-01")
            repeated = train_tool.search_trains("Delhi", "Agra", "2026-12-01")

        self.assertEqual(request.call_count, 4)
        self.assertEqual(result["status"], "SCHEDULES_RETURNED")
        self.assertEqual(repeated["trains"], result["trains"])
        train = result["trains"][0]
        self.assertEqual(train["train_number"], "12002")
        self.assertEqual(train["duration"], "2h 0m")
        self.assertEqual(train["status"], "SCHEDULE_ONLY")
        self.assertEqual(train["fare"]["amount"], 220)
        self.assertEqual(train["fare"]["class_code"], "SL")
        self.assertFalse(train["fare"]["bookable"])

    def test_multiple_station_match_is_resolved_automatically(self):
        response = FakeResponse({"success": True, "data": [
            {"code": "AAA", "name": "Central Station", "city": "A City"},
            {"code": "BBB", "name": "East Station", "city": "B City"},
        ]})
        with patch.object(train_tool.requests, "get", return_value=response):
            station, by_city = train_tool.resolve_station("Central")
        self.assertEqual(station["code"], "AAA")
        self.assertTrue(by_city)

    def test_city_name_resolves_to_its_unique_junction_when_city_field_is_missing(self):
        response = FakeResponse({"success": True, "data": [
            {"code": "JP", "name": "Jaipur Junction", "city": ""},
            {"code": "DPA", "name": "Durgapura", "city": ""},
            {"code": "GADJ", "name": "Gandhinagar Jaipur", "city": ""},
        ]})
        with patch.object(train_tool.requests, "get", return_value=response):
            station, by_city = train_tool.resolve_station("jaipur")
        self.assertEqual(station["code"], "JP")
        self.assertTrue(by_city)

    def test_agra_city_name_resolves_to_unique_cantt_station(self):
        response = FakeResponse({"success": True, "data": [
            {"code": "AGC", "name": "Agra Cantt", "city": ""},
            {"code": "AF", "name": "Agra Fort", "city": ""},
            {"code": "AGA", "name": "Agra City", "city": ""},
        ]})
        with patch.object(train_tool.requests, "get", return_value=response):
            station, by_city = train_tool.resolve_station("agra")
        self.assertEqual(station["code"], "AGC")
        self.assertTrue(by_city)

    def test_region_query_uses_city_wide_search_when_only_station_name_differs(self):
        stations = {
            "Madgaon": {"code": "MAO", "name": "Madgaon Junction", "city": "Margao"},
            "Thivim": {"code": "THVM", "name": "Thivim", "city": "Panaji"},
            "Karmali": {"code": "KRMI", "name": "Karmali", "city": "Old Goa"},
            "Vasco da Gama": {"code": "VSG", "name": "Vasco Da Gama", "city": "Vasco da Gama"},
        }

        def get(url, **kwargs):
            query = kwargs["params"]["q"]
            if query == "Goa":
                return FakeResponse({"success": True, "data": [
                    {"code": "GOA", "name": "Gohad Road", "city": ""},
                ]})
            return FakeResponse({"success": True, "data": [stations[query]]})

        with patch.object(train_tool.requests, "get", side_effect=get):
            options = train_tool.resolve_station_options("Goa")
            first_station, _ = train_tool.resolve_station("Goa")
        self.assertEqual([station["code"] for station, _ in options], ["MAO", "THVM", "KRMI", "VSG"])
        self.assertEqual(first_station["code"], "MAO")

    def test_goa_region_search_aggregates_provider_resolved_station_routes(self):
        delhi = ({"code": "NDLS", "name": "New Delhi", "city": "Delhi"}, True)
        goa_stations = [
            ({"code": "MAO", "name": "Madgaon", "city": ""}, False),
            ({"code": "THVM", "name": "Thivim", "city": ""}, False),
        ]

        def get(url, **kwargs):
            if url.endswith("/fare"):
                return FakeResponse({"success": True, "data": {"breakdown": {"baseFare": 100, "totalFare": 100}}})
            destination_code = url.rsplit("/", 1)[-1]
            return FakeResponse({"success": True, "data": {
                "from": {"code": "NDLS", "name": "New Delhi"},
                "to": {"code": destination_code, "name": destination_code},
                "trains": [{
                    "train": {"number": f"12{destination_code}", "name": f"Express {destination_code}", "runDays": ["sun"]},
                    "from": {"departure": "06:00"}, "to": {"arrival": "18:00"},
                    "duration": 720,
                }],
            }})

        with patch.object(train_tool, "resolve_station_options", side_effect=[[delhi], goa_stations]), patch.object(train_tool.requests, "get", side_effect=get) as request:
            result = train_tool.search_trains("Delhi", "Goa", "2026-12-01")

        self.assertEqual(request.call_count, 4)
        self.assertEqual(result["status"], "SCHEDULES_RETURNED")
        self.assertEqual({train["arrival_station_code"] for train in result["trains"]}, {"MAO", "THVM"})

    def test_when_requested_date_has_no_train_return_nearest_date_suggestion(self):
        stations = [
            ({"code": "NDLS", "name": "New Delhi", "city": "Delhi"}, True),
            ({"code": "AGC", "name": "Agra Cantt", "city": "Agra"}, True),
        ]

        def get(url, **kwargs):
            if url.endswith("/fare"):
                return FakeResponse({"success": True, "data": {"breakdown": {"baseFare": 100, "totalFare": 100}}})
            travel_day = kwargs["params"]["date"]
            trains = []
            if travel_day == "2026-11-30":
                trains = [{
                    "train": {"number": "12618", "name": "Mangala Lakshadweep Express", "runDays": ["mon"]},
                    "from": {"departure": "08:25"}, "to": {"arrival": "17:50"}, "duration": 2005,
                }]
            return FakeResponse({"success": True, "data": {
                "from": {"code": "NDLS", "name": "New Delhi"},
                "to": {"code": "AGC", "name": "Agra Cantt"},
                "trains": trains,
            }})

        with patch.object(train_tool, "resolve_station_options", side_effect=[[stations[0]], [stations[1]]]), patch.object(train_tool.requests, "get", side_effect=get) as request:
            result = train_tool.search_trains("Delhi", "Agra", "2026-12-01")

        self.assertEqual(request.call_count, 4)
        self.assertEqual(result["status"], "SUGGESTIONS_RETURNED")
        self.assertEqual(result["suggested_dates"], ["2026-11-30"])
        self.assertIn("2026-11-30", result["message"])
        self.assertEqual(result["trains"][0]["travel_date"], "2026-11-30")

    def test_provider_auth_error_is_safe_and_does_not_echo_key(self):
        with patch.object(train_tool.requests, "get", return_value=FakeResponse({}, status_code=401)):
            result = train_tool.search_trains("Delhi", "Agra", "2026-12-01")
        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertNotIn("test-key", result["message"])
        self.assertIn("RAILRADAR_API_KEY", result["message"])


if __name__ == "__main__":
    unittest.main()

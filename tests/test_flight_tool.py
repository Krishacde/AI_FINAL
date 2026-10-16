from __future__ import annotations

import unittest
from datetime import date
from unittest.mock import patch

import backend
from tools.flight_tool import parse_route, resolve_location_to_iata


class FlightLocationTests(unittest.TestCase):
    def test_unknown_town_does_not_resolve_to_an_arbitrary_international_airport(self) -> None:
        self.assertIsNone(resolve_location_to_iata("Saputara"))
        self.assertEqual(parse_route("flights from Vadodara to Saputara"), ("BDQ", None))

    def test_planner_skips_flight_api_for_route_without_a_destination_airport(self) -> None:
        request = backend.TripRequest(
            destination="Saputara",
            origin="Vadodara",
            start_date=date(2026, 10, 14),
            end_date=date(2026, 10, 15),
        )
        with patch.object(backend, "search_flights") as search:
            result = backend.flights({
                "request": request.model_dump(mode="json"),
                "selected_destination": "Saputara",
            })
        search.assert_not_called()
        self.assertIn("No airport match", result["flights"][0]["error"])


if __name__ == "__main__":
    unittest.main()

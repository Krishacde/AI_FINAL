from __future__ import annotations

import unittest
from unittest.mock import patch

from services.sandbox_quotes import create_sandbox_cab_quote, create_sandbox_hotel_quote, create_sandbox_schedule_quote


class SandboxQuoteTests(unittest.TestCase):
    def test_quote_is_repeatable_and_covers_dates_rooms_and_guests(self) -> None:
        args = {
            "hotel": {"name": "Example Stay"},
            "destination": "Saputara",
            "check_in": "2026-10-14",
            "check_out": "2026-10-16",
            "nights": 2,
            "travelers": 3,
            "accommodation": "Mid-range hotel",
        }
        first = create_sandbox_hotel_quote(**args)
        second = create_sandbox_hotel_quote(**args)
        self.assertEqual(first["quote_id"], second["quote_id"])
        self.assertEqual(first["amount_minor"], second["amount_minor"])
        self.assertEqual(first["rooms"], 2)
        self.assertEqual(first["amount_minor"], first["nightly_rate_minor"] * 2 * 2)
        self.assertEqual(first["quote_type"], "SANDBOX")

    def test_sandbox_rate_is_configurable(self) -> None:
        with patch.dict("os.environ", {"SANDBOX_HOTEL_BASE_NIGHTLY_INR": "7000", "SANDBOX_HOTEL_RATE_SPREAD_PERCENT": "1"}):
            quote = create_sandbox_hotel_quote(
                hotel={"name": "Another Stay"}, destination="Saputara", check_in="2026-10-14",
                check_out="2026-10-15", nights=1, travelers=1, accommodation="Mid-range hotel",
            )
        self.assertGreaterEqual(quote["nightly_rate_minor"], 690_000)
        self.assertLessEqual(quote["nightly_rate_minor"], 710_000)

    def test_local_cab_quote_is_stable_and_rejects_unknown_inventory(self) -> None:
        args = {"name": "Local Sedan Transfer", "route": "Local transfer · Saputara", "travel_date": "2026-10-14"}
        first = create_sandbox_cab_quote(**args)
        second = create_sandbox_cab_quote(**args)
        self.assertEqual(first["quote_id"], second["quote_id"])
        self.assertEqual(first["amount_minor"], 180_000)
        self.assertEqual(first["quote_type"], "SANDBOX")
        with self.assertRaises(ValueError):
            create_sandbox_cab_quote(name="Unsupported Cab", route=args["route"], travel_date=args["travel_date"])

    def test_schedule_quotes_are_stable_and_labeled_as_simulated(self) -> None:
        args = {"category": "flight", "name": "Example Air 123", "route": "DEL → GOI", "travel_date": "2026-10-26", "travelers": 2}
        first = create_sandbox_schedule_quote(**args)
        second = create_sandbox_schedule_quote(**args)
        self.assertEqual(first["quote_id"], second["quote_id"])
        self.assertEqual(first["amount_minor"], second["amount_minor"])
        self.assertEqual(first["travelers"], 2)
        self.assertEqual(first["quote_type"], "SIMULATED_TEST_PRICE")
        self.assertIn("not a supplier fare", first["note"])
        with self.assertRaises(ValueError):
            create_sandbox_schedule_quote(category="activity", name="Tour", route="Goa", travel_date="2026-10-26")


if __name__ == "__main__":
    unittest.main()

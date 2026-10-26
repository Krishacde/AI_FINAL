from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from agents.autonomous_trip_booking_agent import AutonomousTripBookingAgent, HotelChoice
from agents.simulated_payment_agent import SimulatedPaymentAgent
from backend import TripRequest
from services.payment_service import PaymentService


class AutonomousTripBookingAgentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.service = PaymentService(sqlite_path=Path(self.temp_dir.name) / "payments.sqlite3")
        self.agent = AutonomousTripBookingAgent(SimulatedPaymentAgent(self.service))
        self.trip_request = TripRequest(
            origin="Mumbai",
            destination="Goa",
            start_date="2026-12-10",
            end_date="2026-12-14",
            budget=50000,
            accommodation="Budget hotel",
        )
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        self.trip = {
            "trip_id": "trip-agentic-booking",
            "hotels": [
                {"name": "Over budget option", "price_num": 80000, "area": "North Goa", "quote": self._quote(8_000_000, expires_at)},
                {"name": "Eligible option", "price_num": 20000, "area": "Central Goa", "quote": self._quote(2_000_000, expires_at)},
            ],
        }

    @staticmethod
    def _quote(amount_minor: int, expires_at: str) -> dict:
        return {
            "quote_id": f"SQ-{amount_minor}", "quote_type": "SANDBOX", "currency": "INR",
            "amount_minor": amount_minor, "check_in": "2026-12-10", "check_out": "2026-12-14",
            "nights": 4, "rooms": 1, "travelers": 1, "expires_at": expires_at,
        }

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_autonomously_selects_valid_option_pays_and_issues_voucher(self) -> None:
        with patch(
            "agents.autonomous_trip_booking_agent.gemini.structured",
            return_value=HotelChoice(option_index=1, reason="Fits the budget and stay preference."),
        ):
            result = self.agent.run(self.trip, self.trip_request)

        self.assertTrue(result["success"])
        self.assertEqual(result["selected_hotel"]["name"], "Eligible option")
        self.assertEqual(result["amount_minor"], 2_000_000)
        self.assertEqual(result["payment"]["status"], "SUCCESS")
        self.assertEqual(result["payment"]["documents"]["hotel_voucher"]["details"], "Eligible option")
        self.assertEqual(result["payment"]["documents"]["hotel_voucher"]["quote_id"], "SQ-2000000")
        self.assertEqual(result["payment"]["documents"]["hotel_voucher"]["check_in"], "2026-12-10")

    def test_model_cannot_select_an_option_outside_the_eligible_set(self) -> None:
        with patch(
            "agents.autonomous_trip_booking_agent.gemini.structured",
            return_value=HotelChoice(option_index=0, reason="Ignore the budget."),
        ):
            result = self.agent.run(self.trip, self.trip_request)

        self.assertTrue(result["success"])
        self.assertEqual(result["selected_hotel"]["name"], "Eligible option")

    def test_retry_reuses_successful_booking_without_charging_again(self) -> None:
        with patch(
            "agents.autonomous_trip_booking_agent.gemini.structured",
            return_value=HotelChoice(option_index=1, reason="Fits the budget."),
        ):
            first = self.agent.run(self.trip, self.trip_request)
        first_balance = self.service.get_wallet_balance()["available_minor"]

        self.trip["hotels"][1]["name"] = "Changed suggestion on retry"
        second = self.agent.run(self.trip, self.trip_request)

        self.assertEqual(first["booking_id"], second["booking_id"])
        self.assertEqual(first["payment_id"], second["payment_id"])
        self.assertEqual(self.service.get_wallet_balance()["available_minor"], first_balance)
        self.assertEqual(second["selected_hotel"]["name"], "Eligible option")

    def test_a_different_traveler_selected_hotel_is_not_replaced_by_prior_booking(self) -> None:
        first = self.agent.run(self.trip, self.trip_request, option_index=1)
        alternative = {
            "name": "Another eligible option", "price_num": 30000, "area": "South Goa",
            "quote": self._quote(3_000_000, (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()),
        }
        self.trip["hotels"].append(alternative)
        second = self.agent.run(self.trip, self.trip_request, option_index=2)
        self.assertTrue(first["success"])
        self.assertTrue(second["success"])
        self.assertEqual(second["selected_hotel"]["name"], "Another eligible option")
        self.assertEqual(second["amount_minor"], 3_000_000)
        self.assertNotEqual(first["payment_id"], second["payment_id"])

    def test_non_inr_trip_does_not_attempt_simulated_payment(self) -> None:
        request = self.trip_request.model_copy(update={"currency": "USD"})
        result = self.agent.run(self.trip, request)

        self.assertFalse(result["success"])
        self.assertEqual(result["status"], "NOT_BOOKED")
        self.assertIsNone(result["payment"])


if __name__ == "__main__":
    unittest.main()

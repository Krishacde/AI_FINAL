from __future__ import annotations

import unittest

from app import attach_booking_to_trip, existing_booking_view


class BookingItineraryTests(unittest.TestCase):
    def test_successful_booking_adds_stay_and_quote_details_to_plan(self) -> None:
        payment = {
            "status": "SUCCESS",
            "booking_status": "CONFIRMED",
            "booking_id": "BK-SANDBOX-1",
            "payment_id": "PAY-SANDBOX-1",
            "transaction_id": "TX-SANDBOX-1",
            "amount_minor": 840_000,
            "currency": "INR",
            "items": [{
                "category": "hotel", "name": "Lake Stay", "amount_minor": 840_000,
                "metadata": {
                    "quote_id": "SQ-1", "quote_type": "SANDBOX", "check_in": "2026-10-14",
                    "check_out": "2026-10-16", "nights": 2, "rooms": 1, "travelers": 2,
                },
            }],
            "documents": {"hotel_voucher": {"document_id": "HTL-1"}},
        }
        booking = existing_booking_view(payment, [])
        trip = {"selected_destination": "Saputara", "itinerary": [{"title": "Visit lake"}]}
        attach_booking_to_trip(trip, booking, {"start_date": "2026-10-14"})

        stay = trip["itinerary"][0]
        self.assertEqual(stay["title"], "Sandbox accommodation confirmed: Lake Stay")
        self.assertEqual(stay["date"], "2026-10-14")
        self.assertEqual(stay["estimated_cost"], 8400)
        self.assertIn("2 night(s), 1 room(s), 2 guest(s)", stay["description"])
        self.assertEqual(stay["document_id"], "HTL-1")


if __name__ == "__main__":
    unittest.main()

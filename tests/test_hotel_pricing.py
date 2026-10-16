from __future__ import annotations

import unittest
from datetime import date
from unittest.mock import patch

import backend


class HotelPricingTests(unittest.TestCase):
    def test_full_stay_sandbox_quote_is_canonical_and_model_price_is_ignored(self) -> None:
        request = backend.TripRequest(
            destination="Sample City",
            origin="Sample Origin",
            start_date=date(2026, 10, 6),
            end_date=date(2026, 10, 9),
        )
        hotels = [
            backend.CleanHotelCard(
                name="Consistent Demo Hotel",
                area="Central",
                nightly_price="₹50,000 / night",
                total_price="₹10,00,000 (conflicting model text)",
                price_num=15000,
                amenities="Wi-Fi",
            ),
            backend.CleanHotelCard(
                name="Out Of Range Demo Hotel",
                area="Central",
                nightly_price="₹2,00,000 / night",
                total_price="₹6,00,000",
                price_num=600000,
                amenities="Wi-Fi",
            ),
        ]
        fake_result = type("HotelResult", (), {"hotels": hotels})()

        with (
            patch.object(backend, "research", return_value=([{
                "title": "Consistent Hotel rooms and amenities",
                "snippet": "Consistent Hotel is a sample hotel listing.",
                "url": "https://example.test/hotel",
            }], [])),
            patch.object(backend.gemini, "structured", return_value=fake_result),
        ):
            result = backend.hotels({
                "request": request.model_dump(mode="json"),
                "selected_destination": "Sample City",
            })

        consistent, outlier = result["hotels"]
        self.assertEqual(consistent["price_num"], consistent["quote"]["amount_minor"] // 100)
        self.assertEqual(
            consistent["total_price"],
            f"₹{consistent['price_num']:,} sandbox total for 3 night(s)",
        )
        self.assertEqual(
            consistent["price_num"],
            consistent["quote"]["nightly_rate_minor"] // 100 * 3,
        )
        self.assertEqual(consistent["quote_type"], "SANDBOX")
        self.assertLess(outlier["price_num"], backend.MAX_SIMULATED_HOTEL_STAY_INR)
        self.assertNotEqual(outlier["price_num"], 600000)


if __name__ == "__main__":
    unittest.main()

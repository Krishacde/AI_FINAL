from __future__ import annotations

import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch
from pathlib import Path

from agents.simulated_payment_agent import SimulatedPaymentAgent
from services.payment_service import (
    InsufficientFundsError,
    InvalidPaymentTransition,
    PaymentPolicyError,
    PaymentService,
)


def demo_items() -> list[dict]:
    return [
        {"category": "train", "name": "Demo train", "amount_minor": 85000},
        {"category": "hotel", "name": "Demo hotel", "amount_minor": 350000},
        {"category": "flight", "name": "Demo flight", "amount_minor": 420000},
    ]


class SimulatedPaymentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "payments.sqlite3"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def service(self, **kwargs) -> PaymentService:
        return PaymentService(sqlite_path=self.db_path, **kwargs)

    def create(self, service: PaymentService, suffix: str = "one", items: list[dict] | None = None) -> str:
        payment = service.create_payment(
            trip_id=f"trip-{suffix}",
            booking_id=f"booking-{suffix}",
            idempotency_key=f"key-{suffix}",
            items=items or demo_items(),
        )
        return payment["payment_id"]

    def test_generic_database_url_does_not_select_payment_postgres(self) -> None:
        with (
            patch.dict(
                "os.environ",
                {
                    "DATABASE_URL": "postgresql://unrelated:password@localhost:5432/app",
                    "SIMULATED_PAYMENT_DATABASE_URL": "",
                },
            ),
            patch.object(PaymentService, "_initialize"),
        ):
            service = PaymentService()

        self.assertIsNone(service.postgres_url)

    def test_payment_postgres_requires_dedicated_database_url(self) -> None:
        payment_database_url = "postgresql://payment:password@localhost:5432/payments"
        with (
            patch.dict(
                "os.environ",
                {"SIMULATED_PAYMENT_DATABASE_URL": payment_database_url},
            ),
            patch.object(PaymentService, "_initialize"),
        ):
            service = PaymentService()

        self.assertEqual(service.postgres_url, payment_database_url)

    def test_end_to_end_autonomous_booking_and_settlement(self) -> None:
        service = self.service()
        result = SimulatedPaymentAgent(service).run("trip-success", demo_items())

        self.assertTrue(result["success"])
        self.assertEqual(result["payment_status"], "SUCCESS")
        self.assertEqual(result["booking_status"], "CONFIRMED")
        self.assertEqual(result["amount_minor"], 855000)
        self.assertEqual(service.get_wallet_balance()["available_minor"], 9145000)
        self.assertEqual(service.get_wallet_balance()["reserved_minor"], 0)
        self.assertEqual(service.get_merchant_balances(), {
            "train": 85000,
            "hotel": 350000,
            "cab": 0,
            "flight": 420000,
            "activity": 0,
        })
        documents = result["payment"]["documents"]
        self.assertEqual(documents["label"], "SANDBOX / SIMULATED BOOKING")
        document_records = [document for key, document in documents.items() if key != "label"]
        self.assertEqual(len(document_records), 5)
        self.assertTrue(all(doc["label"] == "SANDBOX / SIMULATED BOOKING" for doc in document_records))
        self.assertEqual(sum(row["amount_minor"] * (1 if row["direction"] == "CREDIT" else -1) for row in service.get_ledger(result["payment_id"])), 0)

    def test_hotel_selection_books_only_hotel_and_returns_voucher_and_receipt(self) -> None:
        service = self.service()
        agent = SimulatedPaymentAgent(service)
        hotel = [{"category": "hotel", "name": "Selected hotel", "amount_minor": 1250000}]

        result = agent.run("trip-hotel-only", hotel)
        repeated = agent.run("trip-hotel-only", hotel)

        self.assertTrue(result["success"])
        self.assertEqual(result["amount_minor"], 1250000)
        self.assertEqual(
            [{key: item[key] for key in ("category", "name", "amount_minor")} for item in result["payment"]["items"]],
            hotel,
        )
        self.assertEqual(result["payment"]["documents"]["hotel_voucher"]["details"], "Selected hotel")
        self.assertIn("payment_receipt", result["payment"]["documents"])
        self.assertNotIn("train_ticket", result["payment"]["documents"])
        self.assertNotIn("flight_ticket", result["payment"]["documents"])
        self.assertEqual(result["payment_id"], repeated["payment_id"])
        self.assertEqual(result["transaction_id"], repeated["transaction_id"])

    def test_selected_cab_is_paid_and_transport_document_is_issued(self) -> None:
        result = SimulatedPaymentAgent(self.service()).run(
            "trip-cab-selected",
            [{"category": "cab", "name": "Local Sedan Transfer", "amount_minor": 180000,
              "metadata": {"route": "Local transfer · Saputara", "quote_type": "SANDBOX"}}],
        )
        self.assertTrue(result["success"])
        self.assertEqual(result["payment"]["items"][0]["category"], "cab")
        self.assertEqual(result["payment"]["documents"]["transport_voucher"]["details"], "Local Sedan Transfer")

    def test_different_hotel_selection_creates_a_separate_booking(self) -> None:
        agent = SimulatedPaymentAgent(self.service())
        first = agent.run("trip-hotel-choice", [{"category": "hotel", "name": "Hotel A", "amount_minor": 100000}])
        second = agent.run("trip-hotel-choice", [{"category": "hotel", "name": "Hotel B", "amount_minor": 200000}])

        self.assertTrue(first["success"])
        self.assertTrue(second["success"])
        self.assertNotEqual(first["booking_id"], second["booking_id"])
        self.assertNotEqual(first["payment_id"], second["payment_id"])

    def test_insufficient_wallet_fails_without_reserving(self) -> None:
        service = self.service(wallet_balance_minor=1000)
        result = SimulatedPaymentAgent(service).run("trip-poor", demo_items())

        self.assertFalse(result["success"])
        self.assertEqual(result["payment_status"], "FAILED")
        self.assertIn("Insufficient simulated wallet balance", result["error"])
        self.assertEqual(service.get_wallet_balance()["available_minor"], 1000)
        self.assertEqual(service.get_wallet_balance()["reserved_minor"], 0)
        self.assertEqual(service.get_ledger(result["payment_id"]), [])

    def test_transaction_limit_is_enforced(self) -> None:
        service = self.service(max_transaction_minor=500000)
        with self.assertRaises(PaymentPolicyError):
            self.create(service, "transaction-limit")

    def test_daily_limit_is_enforced_before_reservation(self) -> None:
        service = self.service(daily_limit_minor=900000)
        first = self.create(service, "daily-first")
        service.authorize_payment(first)
        service.reserve_funds(first)
        second = self.create(service, "daily-second", [{"category": "hotel", "amount_minor": 100000}])
        service.authorize_payment(second)

        with self.assertRaises(PaymentPolicyError):
            service.reserve_funds(second)

    def test_duplicate_create_returns_same_payment(self) -> None:
        service = self.service()
        first = service.create_payment(
            trip_id="same-trip",
            booking_id="same-booking",
            idempotency_key="same-key",
            items=demo_items(),
        )
        second = service.create_payment(
            trip_id="same-trip",
            booking_id="same-booking",
            idempotency_key="same-key",
            items=demo_items(),
        )
        self.assertEqual(first["payment_id"], second["payment_id"])

    def test_idempotent_capture_does_not_duplicate_ledger_or_settlement(self) -> None:
        service = self.service()
        payment_id = self.create(service, "capture")
        service.authorize_payment(payment_id)
        service.reserve_funds(payment_id)
        service.mark_booking_confirmed(payment_id)
        first = service.capture_payment(payment_id)
        first_ledger = service.get_ledger(payment_id)
        second = service.capture_payment(payment_id)

        self.assertEqual(first["transaction_id"], second["transaction_id"])
        self.assertEqual(len(first_ledger), len(service.get_ledger(payment_id)))
        self.assertEqual(service.get_merchant_balances()["hotel"], 350000)

    def test_concurrent_payments_cannot_overdraw_wallet(self) -> None:
        service = self.service(wallet_balance_minor=1000, max_transaction_minor=1000, daily_limit_minor=10000)
        ids = [
            self.create(service, "parallel-a", [{"category": "hotel", "amount_minor": 700}]),
            self.create(service, "parallel-b", [{"category": "hotel", "amount_minor": 700}]),
        ]
        for payment_id in ids:
            service.authorize_payment(payment_id)

        successes: list[str] = []
        failures: list[str] = []

        def reserve(payment_id: str) -> None:
            try:
                service.reserve_funds(payment_id)
                successes.append(payment_id)
            except InsufficientFundsError:
                failures.append(payment_id)

        threads = [threading.Thread(target=reserve, args=(payment_id,)) for payment_id in ids]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(len(successes), 1)
        self.assertEqual(len(failures), 1)
        self.assertEqual(service.get_wallet_balance()["available_minor"], 300)
        self.assertEqual(service.get_wallet_balance()["reserved_minor"], 700)

    def test_refund_reverses_merchant_settlement(self) -> None:
        service = self.service()
        payment_id = self.create(service, "refund")
        service.authorize_payment(payment_id)
        service.reserve_funds(payment_id)
        service.mark_booking_confirmed(payment_id)
        service.capture_payment(payment_id)
        refunded = service.refund_payment(payment_id, "Customer cancellation.")

        self.assertEqual(refunded["status"], "REFUNDED")
        self.assertEqual(service.get_wallet_balance()["available_minor"], 10000000)
        self.assertEqual(service.get_merchant_balances()["train"], 0)

    def test_booking_failure_releases_reserved_funds_and_does_not_settle(self) -> None:
        items = demo_items()
        items[2]["available"] = False
        service = self.service()
        result = SimulatedPaymentAgent(service).run("trip-failed", items)

        self.assertFalse(result["success"])
        self.assertEqual(result["payment_status"], "REFUNDED")
        self.assertEqual(result["booking_status"], "CANCELLED")
        self.assertEqual(service.get_wallet_balance()["available_minor"], 10000000)
        self.assertEqual(service.get_merchant_balances()["flight"], 0)

    def test_partial_booking_failure_compensates_all_items(self) -> None:
        items = [
            {"category": "train", "name": "Available train", "amount_minor": 10000},
            {"category": "hotel", "name": "Unavailable hotel", "amount_minor": 20000, "available": False},
        ]
        service = self.service()
        result = SimulatedPaymentAgent(service).run("trip-partial", items)

        self.assertFalse(result["success"])
        self.assertEqual(service.get_wallet_balance()["available_minor"], 10000000)
        self.assertEqual(service.get_merchant_balances()["train"], 0)
        self.assertEqual(service.get_merchant_balances()["hotel"], 0)

    def test_invalid_state_transition_is_rejected(self) -> None:
        service = self.service()
        payment_id = self.create(service, "invalid-transition")
        with self.assertRaises(InvalidPaymentTransition):
            service.capture_payment(payment_id)

    def test_ledger_rows_are_immutable(self) -> None:
        service = self.service()
        payment_id = self.create(service, "immutable")
        service.authorize_payment(payment_id)
        service.reserve_funds(payment_id)
        with self.assertRaises(sqlite3.IntegrityError):
            with service._transaction() as cursor:
                service._execute(cursor, "UPDATE ledger SET description = 'changed'")

    def test_fractional_money_is_rejected(self) -> None:
        service = self.service()
        with self.assertRaises(ValueError):
            service.create_payment(
                trip_id="trip-fraction",
                booking_id="booking-fraction",
                idempotency_key="key-fraction",
                items=[{"category": "hotel", "amount_minor": 10.5}],
            )


if __name__ == "__main__":
    unittest.main()

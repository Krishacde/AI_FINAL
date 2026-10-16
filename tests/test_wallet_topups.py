from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from services.payment_service import PaymentError, PaymentPolicyError, PaymentService


class WalletTopUpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.service = PaymentService(sqlite_path=Path(self.temp_dir.name) / "payments.sqlite3")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_top_up_credits_wallet_and_is_idempotent(self) -> None:
        first = self.service.add_simulated_funds(250_000, "topup-1")
        second = self.service.add_simulated_funds(250_000, "topup-1")

        self.assertEqual(first["available_minor"], 10_250_000)
        self.assertEqual(second["available_minor"], 10_250_000)

    def test_top_up_enforces_demo_limit(self) -> None:
        with self.assertRaises(PaymentPolicyError):
            self.service.add_simulated_funds(100_000_001, "too-large")

    def test_idempotency_key_cannot_be_reused_for_a_different_amount(self) -> None:
        self.service.add_simulated_funds(250_000, "topup-1")
        with self.assertRaises(PaymentError):
            self.service.add_simulated_funds(300_000, "topup-1")


if __name__ == "__main__":
    unittest.main()

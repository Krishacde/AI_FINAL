"""The only module that changes simulated wallet balances and payment records."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


WALLET_ID = "WALLET-001"
WALLET_NAME = "TripMate Payment Agent"
MERCHANTS = {
    "train": "TRAIN-MERCHANT",
    "hotel": "HOTEL-MERCHANT",
    "cab": "TRANSPORT-MERCHANT",
    "flight": "FLIGHT-MERCHANT",
    "activity": "ACTIVITY-MERCHANT",
}
VALID_STATES = {
    "CREATED": {"PENDING", "FAILED", "CANCELLED"},
    "PENDING": {"AUTHORIZED", "FAILED", "CANCELLED"},
    "AUTHORIZED": {"FUNDS_RESERVED", "FAILED", "CANCELLED"},
    "FUNDS_RESERVED": {"BOOKING_IN_PROGRESS", "REFUND_PENDING", "FAILED", "CANCELLED"},
    "BOOKING_IN_PROGRESS": {"CAPTURED", "REFUND_PENDING", "FAILED"},
    "CAPTURED": {"SUCCESS", "REFUND_PENDING"},
    "SUCCESS": {"REFUND_PENDING"},
    "FAILED": set(),
    "CANCELLED": set(),
    "REFUND_PENDING": {"REFUNDED"},
    "REFUNDED": set(),
}
ACTIVE_DAILY_STATES = ("FUNDS_RESERVED", "BOOKING_IN_PROGRESS", "CAPTURED", "SUCCESS", "REFUND_PENDING")


class PaymentError(ValueError):
    pass


class PaymentPolicyError(PaymentError):
    pass


class InsufficientFundsError(PaymentError):
    pass


class InvalidPaymentTransition(PaymentError):
    pass


class Wallet:
    """Simulated wallet and payment record store; never calls a real provider."""

    def __init__(
        self,
        database_url: str | None = None,
        sqlite_path: str | Path | None = None,
        wallet_balance_minor: int | None = None,
        max_transaction_minor: int | None = None,
        daily_limit_minor: int | None = None,
    ) -> None:
        configured_url = (
            database_url
            if database_url is not None
            else os.getenv("SIMULATED_PAYMENT_DATABASE_URL", "")
        )
        self.postgres_url = configured_url if configured_url.startswith(("postgres://", "postgresql://")) else None
        local_app_data = Path(os.getenv("LOCALAPPDATA", Path.home()))
        self.sqlite_path = Path(
            sqlite_path
            or os.getenv("SIMULATED_PAYMENT_DB")
            or local_app_data / "TripMateAI" / "payments.sqlite3"
        )
        self.wallet_balance_minor = int(
            wallet_balance_minor
            if wallet_balance_minor is not None
            else os.getenv("SIMULATED_AGENT_WALLET_MINOR", "10000000")
        )
        self.max_transaction_minor = int(
            max_transaction_minor
            if max_transaction_minor is not None
            else os.getenv("SIMULATED_MAX_TRANSACTION_MINOR", "10000000")
        )
        self.daily_limit_minor = int(
            daily_limit_minor
            if daily_limit_minor is not None
            else os.getenv("SIMULATED_DAILY_LIMIT_MINOR", "20000000")
        )
        if min(self.wallet_balance_minor, self.max_transaction_minor, self.daily_limit_minor) <= 0:
            raise ValueError("Simulated wallet and payment-policy limits must be positive minor-unit amounts.")
        self._initialize()

    def _connect(self):
        if self.postgres_url:
            import psycopg
            from psycopg.rows import dict_row

            return psycopg.connect(self.postgres_url, row_factory=dict_row)
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.sqlite_path, timeout=30, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 30000")
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _execute(self, cursor, statement: str, params: tuple[Any, ...] = ()):
        if self.postgres_url:
            statement = statement.replace("?", "%s")
        return cursor.execute(statement, params)

    @contextmanager
    def _transaction(self) -> Iterator[Any]:
        connection = self._connect()
        cursor = connection.cursor()
        try:
            cursor.execute("BEGIN" if self.postgres_url else "BEGIN IMMEDIATE")
            yield cursor
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            cursor.close()
            connection.close()

    def _initialize(self) -> None:
        schema = [
            """CREATE TABLE IF NOT EXISTS wallets (
                wallet_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                currency TEXT NOT NULL,
                available_minor BIGINT NOT NULL CHECK (available_minor >= 0),
                reserved_minor BIGINT NOT NULL CHECK (reserved_minor >= 0)
            )""",
            """CREATE TABLE IF NOT EXISTS merchants (
                merchant_id TEXT PRIMARY KEY,
                category TEXT NOT NULL UNIQUE,
                balance_minor BIGINT NOT NULL CHECK (balance_minor >= 0)
            )""",
            """CREATE TABLE IF NOT EXISTS payments (
                payment_id TEXT PRIMARY KEY,
                booking_id TEXT NOT NULL UNIQUE,
                idempotency_key TEXT NOT NULL UNIQUE,
                amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
                currency TEXT NOT NULL,
                status TEXT NOT NULL,
                error TEXT,
                transaction_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                history_json TEXT NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS bookings (
                booking_id TEXT PRIMARY KEY,
                trip_id TEXT NOT NULL,
                payment_id TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL,
                items_json TEXT NOT NULL,
                documents_json TEXT,
                created_at TEXT NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS ledger (
                ledger_id TEXT PRIMARY KEY,
                transaction_id TEXT NOT NULL,
                idempotency_key TEXT NOT NULL UNIQUE,
                payment_id TEXT NOT NULL,
                booking_id TEXT NOT NULL,
                wallet_id TEXT NOT NULL,
                merchant_id TEXT,
                movement_type TEXT NOT NULL,
                direction TEXT NOT NULL,
                amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
                currency TEXT NOT NULL,
                balance_before BIGINT NOT NULL,
                balance_after BIGINT NOT NULL,
                description TEXT NOT NULL,
                created_at TEXT NOT NULL
            )""",
        ]
        with self._transaction() as cursor:
            for statement in schema:
                self._execute(cursor, statement)
            self._execute(
                cursor,
                "INSERT INTO wallets (wallet_id, name, currency, available_minor, reserved_minor) "
                "VALUES (?, ?, 'INR', ?, 0) ON CONFLICT (wallet_id) DO NOTHING",
                (WALLET_ID, WALLET_NAME, self.wallet_balance_minor),
            )
            for category, merchant_id in MERCHANTS.items():
                self._execute(
                    cursor,
                    "INSERT INTO merchants (merchant_id, category, balance_minor) "
                    "VALUES (?, ?, 0) ON CONFLICT (merchant_id) DO NOTHING",
                    (merchant_id, category),
                )
            if self.postgres_url:
                self._execute(
                    cursor,
                    """CREATE OR REPLACE FUNCTION tripmate_reject_ledger_mutation()
                       RETURNS trigger AS $$
                       BEGIN
                           RAISE EXCEPTION 'Payment ledger entries are immutable';
                       END;
                       $$ LANGUAGE plpgsql""",
                )
                self._execute(cursor, "DROP TRIGGER IF EXISTS ledger_immutable ON ledger")
                self._execute(
                    cursor,
                    """CREATE TRIGGER ledger_immutable
                       BEFORE UPDATE OR DELETE ON ledger
                       FOR EACH ROW EXECUTE FUNCTION tripmate_reject_ledger_mutation()""",
                )
            else:
                self._execute(
                    cursor,
                    """CREATE TRIGGER IF NOT EXISTS ledger_no_update
                       BEFORE UPDATE ON ledger BEGIN
                           SELECT RAISE(ABORT, 'Payment ledger entries are immutable');
                       END""",
                )
                self._execute(
                    cursor,
                    """CREATE TRIGGER IF NOT EXISTS ledger_no_delete
                       BEFORE DELETE ON ledger BEGIN
                           SELECT RAISE(ABORT, 'Payment ledger entries are immutable');
                       END""",
                )

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _record_ledger(
        self,
        cursor,
        *,
        payment_id: str,
        booking_id: str,
        transaction_id: str,
        idempotency_key: str,
        merchant_id: str | None,
        movement_type: str,
        direction: str,
        amount_minor: int,
        balance_before: int,
        balance_after: int,
        description: str,
    ) -> None:
        self._execute(
            cursor,
            """INSERT INTO ledger (
                ledger_id, transaction_id, idempotency_key, payment_id, booking_id,
                wallet_id, merchant_id, movement_type, direction, amount_minor,
                currency, balance_before, balance_after, description, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?)""",
            (
                uuid.uuid4().hex,
                transaction_id,
                idempotency_key,
                payment_id,
                booking_id,
                WALLET_ID,
                merchant_id,
                movement_type,
                direction,
                amount_minor,
                balance_before,
                balance_after,
                description,
                self._now(),
            ),
        )

    def _payment(self, cursor, payment_id: str, for_update: bool = False) -> dict[str, Any]:
        statement = "SELECT * FROM payments WHERE payment_id = ?"
        if for_update and self.postgres_url:
            statement += " FOR UPDATE"
        self._execute(cursor, statement, (payment_id,))
        row = cursor.fetchone()
        if row is None:
            raise PaymentError("Payment was not found.")
        result = dict(row)
        result["history"] = json.loads(result.pop("history_json"))
        return result

    def _transition(self, cursor, payment_id: str, next_state: str, error: str | None = None) -> None:
        payment = self._payment(cursor, payment_id, for_update=True)
        current = payment["status"]
        if current == next_state:
            return
        if next_state not in VALID_STATES.get(current, set()):
            raise InvalidPaymentTransition(f"Invalid payment transition: {current} -> {next_state}.")
        history = payment["history"]
        history.append({"state": next_state, "at": self._now()})
        self._execute(
            cursor,
            "UPDATE payments SET status = ?, error = ?, updated_at = ?, history_json = ? WHERE payment_id = ?",
            (next_state, error, self._now(), json.dumps(history), payment_id),
        )

    def get_payment_policy(self) -> dict[str, Any]:
        return {
            "currency": "INR",
            "max_transaction_minor": self.max_transaction_minor,
            "daily_limit_minor": self.daily_limit_minor,
            "auto_approve": True,
            "allowed_categories": sorted(MERCHANTS),
            "money_mode": "SIMULATED_ONLY",
        }

    def get_spending_today_minor(self, exclude_payment_id: str | None = None) -> int:
        """Return today's active simulated spend for the agent's risk check."""
        today = datetime.now(timezone.utc).date().isoformat()
        marks = ",".join("?" for _ in ACTIVE_DAILY_STATES)
        with self._transaction() as cursor:
            self._execute(
                cursor,
                f"""SELECT COALESCE(SUM(amount_minor), 0) AS spent FROM payments
                    WHERE created_at >= ? AND payment_id != ? AND status IN ({marks})""",
                (today, exclude_payment_id or "", *ACTIVE_DAILY_STATES),
            )
            return int(cursor.fetchone()["spent"])

    def get_wallet_balance(self) -> dict[str, Any]:
        with self._transaction() as cursor:
            self._execute(cursor, "SELECT * FROM wallets WHERE wallet_id = ?", (WALLET_ID,))
            wallet = dict(cursor.fetchone())
            return {
                "wallet_id": wallet["wallet_id"],
                "name": wallet["name"],
                "currency": wallet["currency"],
                "available_minor": wallet["available_minor"],
                "reserved_minor": wallet["reserved_minor"],
                "total_minor": wallet["available_minor"] + wallet["reserved_minor"],
            }

    def add_simulated_funds(self, amount_minor: int, idempotency_key: str) -> dict[str, Any]:
        """Credit demo-only funds and record the top-up as an immutable ledger movement."""
        if isinstance(amount_minor, bool) or not isinstance(amount_minor, int) or amount_minor <= 0:
            raise PaymentError("Top-up amount must be a positive whole number of paise.")
        if amount_minor > 100_000_000:
            raise PaymentPolicyError("A simulated top-up cannot exceed ₹1,000,000.")
        if not idempotency_key or len(idempotency_key) > 160:
            raise PaymentError("A valid top-up idempotency key is required.")

        with self._transaction() as cursor:
            wallet_query = "SELECT * FROM wallets WHERE wallet_id = ?" + (" FOR UPDATE" if self.postgres_url else "")
            self._execute(cursor, wallet_query, (WALLET_ID,))
            wallet = dict(cursor.fetchone())
            ledger_key = f"wallet-topup:{idempotency_key}"
            self._execute(cursor, "SELECT amount_minor FROM ledger WHERE idempotency_key = ?", (ledger_key,))
            existing_topup = cursor.fetchone()
            if existing_topup:
                if existing_topup["amount_minor"] != amount_minor:
                    raise PaymentError("Top-up idempotency key was already used for a different amount.")
                current = wallet
                return {
                    "wallet_id": current["wallet_id"], "name": current["name"], "currency": current["currency"],
                    "available_minor": current["available_minor"], "reserved_minor": current["reserved_minor"],
                    "total_minor": current["available_minor"] + current["reserved_minor"],
                }

            before = wallet["available_minor"]
            after = before + amount_minor
            topup_id = f"TOPUP-{uuid.uuid4().hex[:16].upper()}"
            transaction_id = f"TXN-{uuid.uuid4().hex[:16].upper()}"
            self._execute(cursor, "UPDATE wallets SET available_minor = ? WHERE wallet_id = ?", (after, WALLET_ID))
            self._record_ledger(
                cursor,
                payment_id=topup_id,
                booking_id=topup_id,
                transaction_id=transaction_id,
                idempotency_key=ledger_key,
                merchant_id=None,
                movement_type="TOP_UP",
                direction="CREDIT",
                amount_minor=amount_minor,
                balance_before=before,
                balance_after=after,
                description="Simulated demo funds added to the agent wallet; no real money collected.",
            )
            return {
                "wallet_id": wallet["wallet_id"], "name": wallet["name"], "currency": wallet["currency"],
                "available_minor": after, "reserved_minor": wallet["reserved_minor"],
                "total_minor": after + wallet["reserved_minor"],
            }

    def get_merchant_balances(self) -> dict[str, int]:
        with self._transaction() as cursor:
            self._execute(cursor, "SELECT category, balance_minor FROM merchants")
            return {row["category"]: row["balance_minor"] for row in cursor.fetchall()}

    def create_payment(
        self,
        *,
        trip_id: str,
        booking_id: str,
        idempotency_key: str,
        items: list[dict[str, Any]],
        currency: str = "INR",
    ) -> dict[str, Any]:
        if currency != "INR":
            raise PaymentPolicyError("The simulated wallet only supports INR.")
        if not trip_id.strip() or not booking_id.strip() or not idempotency_key.strip():
            raise PaymentError("Trip, booking, and idempotency identifiers are required.")
        if not items:
            raise PaymentError("At least one simulated booking item is required.")
        total = 0
        safe_items: list[dict[str, Any]] = []
        for item in items:
            category = item.get("category")
            amount = item.get("amount_minor")
            if category not in MERCHANTS:
                raise PaymentPolicyError(f"Unsupported simulated booking category: {category!r}.")
            if isinstance(amount, bool) or not isinstance(amount, int) or amount <= 0:
                raise PaymentError("Each booking amount must be a positive integer in minor units.")
            total += amount
            safe_items.append(
                {
                    "category": category,
                    "name": str(item.get("name") or category.title())[:160],
                    "amount_minor": amount,
                    "available": item.get("available") is not False,
                    "metadata": {
                        key: value
                        for key, value in (item.get("metadata") or {}).items()
                        if key in {"quote_id", "quote_type", "check_in", "check_out", "nights", "rooms", "travelers"}
                        and isinstance(value, (str, int))
                        and not isinstance(value, bool)
                    } if isinstance(item.get("metadata") or {}, dict) else {},
                }
            )
        if total > self.max_transaction_minor:
            raise PaymentPolicyError("Transaction limit exceeded.")

        with self._transaction() as cursor:
            self._execute(cursor, "SELECT * FROM payments WHERE idempotency_key = ?", (idempotency_key,))
            existing = cursor.fetchone()
            if existing is not None:
                existing_payment = self._payment(cursor, existing["payment_id"])
                self._execute(cursor, "SELECT items_json FROM bookings WHERE booking_id = ?", (booking_id,))
                stored = cursor.fetchone()
                if existing_payment["amount_minor"] != total or not stored or json.loads(stored["items_json"]) != safe_items:
                    raise PaymentError("Idempotency key was already used for a different payment request.")
                return self.get_payment_status(existing_payment["payment_id"], cursor=cursor)

            payment_id = f"PAY-{uuid.uuid4().hex[:16].upper()}"
            now = self._now()
            history = [{"state": "CREATED", "at": now}]
            self._execute(
                cursor,
                """INSERT INTO payments (
                    payment_id, booking_id, idempotency_key, amount_minor, currency,
                    status, created_at, updated_at, history_json
                ) VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?, ?)""",
                (payment_id, booking_id, idempotency_key, total, currency, now, now, json.dumps(history)),
            )
            self._execute(
                cursor,
                """INSERT INTO bookings (booking_id, trip_id, payment_id, status, items_json, created_at)
                   VALUES (?, ?, ?, 'CREATED', ?, ?)""",
                (booking_id, trip_id, payment_id, json.dumps(safe_items), now),
            )
            return self.get_payment_status(payment_id, cursor=cursor)

    def authorize_payment(self, payment_id: str) -> dict[str, Any]:
        with self._transaction() as cursor:
            payment = self._payment(cursor, payment_id, for_update=True)
            if payment["status"] in {"AUTHORIZED", "FUNDS_RESERVED", "BOOKING_IN_PROGRESS", "CAPTURED", "SUCCESS"}:
                return self.get_payment_status(payment_id, cursor=cursor)
            if payment["status"] != "CREATED":
                raise InvalidPaymentTransition(f"Cannot authorize a payment in {payment['status']} state.")
            self._transition(cursor, payment_id, "PENDING")
            self._transition(cursor, payment_id, "AUTHORIZED")
            return self.get_payment_status(payment_id, cursor=cursor)

    def reserve_funds(self, payment_id: str) -> dict[str, Any]:
        with self._transaction() as cursor:
            payment = self._payment(cursor, payment_id, for_update=True)
            if payment["status"] in {"FUNDS_RESERVED", "BOOKING_IN_PROGRESS", "CAPTURED", "SUCCESS"}:
                return self.get_payment_status(payment_id, cursor=cursor)
            if payment["status"] != "AUTHORIZED":
                raise InvalidPaymentTransition(f"Cannot reserve funds in {payment['status']} state.")
            wallet_query = "SELECT * FROM wallets WHERE wallet_id = ?" + (" FOR UPDATE" if self.postgres_url else "")
            self._execute(cursor, wallet_query, (WALLET_ID,))
            wallet = dict(cursor.fetchone())
            payment = self._payment(cursor, payment_id, for_update=True)
            if payment["status"] in {"FUNDS_RESERVED", "BOOKING_IN_PROGRESS", "CAPTURED", "SUCCESS"}:
                return self.get_payment_status(payment_id, cursor=cursor)
            if payment["status"] != "AUTHORIZED":
                raise InvalidPaymentTransition(f"Cannot reserve funds in {payment['status']} state.")
            today = datetime.now(timezone.utc).date().isoformat()
            state_marks = ",".join("?" for _ in ACTIVE_DAILY_STATES)
            self._execute(
                cursor,
                f"""SELECT COALESCE(SUM(amount_minor), 0) AS spent FROM payments
                    WHERE payment_id != ? AND created_at >= ? AND status IN ({state_marks})""",
                (payment_id, today, *ACTIVE_DAILY_STATES),
            )
            daily_total = int(cursor.fetchone()["spent"])
            if daily_total + payment["amount_minor"] > self.daily_limit_minor:
                raise PaymentPolicyError("Daily payment limit exceeded.")
            if wallet["available_minor"] < payment["amount_minor"]:
                raise InsufficientFundsError("Insufficient simulated wallet balance.")
            before = wallet["available_minor"]
            after = before - payment["amount_minor"]
            self._execute(
                cursor,
                "UPDATE wallets SET available_minor = ?, reserved_minor = reserved_minor + ? WHERE wallet_id = ?",
                (after, payment["amount_minor"], WALLET_ID),
            )
            self._transition(cursor, payment_id, "FUNDS_RESERVED")
            self._transition(cursor, payment_id, "BOOKING_IN_PROGRESS")
            transaction_id = f"TXN-{uuid.uuid4().hex[:16].upper()}"
            self._record_ledger(
                cursor,
                payment_id=payment_id,
                booking_id=payment["booking_id"],
                transaction_id=transaction_id,
                idempotency_key=f"reserve:{payment_id}",
                merchant_id=None,
                movement_type="RESERVE",
                direction="DEBIT",
                amount_minor=payment["amount_minor"],
                balance_before=before,
                balance_after=after,
                description="Simulated funds reserved for travel booking.",
            )
            self._record_ledger(
                cursor,
                payment_id=payment_id,
                booking_id=payment["booking_id"],
                transaction_id=transaction_id,
                idempotency_key=f"reserve-escrow:{payment_id}",
                merchant_id=None,
                movement_type="ESCROW_RESERVE",
                direction="CREDIT",
                amount_minor=payment["amount_minor"],
                balance_before=wallet["reserved_minor"],
                balance_after=wallet["reserved_minor"] + payment["amount_minor"],
                description="Simulated reserved funds recorded in booking escrow.",
            )
            return self.get_payment_status(payment_id, cursor=cursor)

    def mark_booking_confirmed(self, payment_id: str) -> dict[str, Any]:
        with self._transaction() as cursor:
            payment = self._payment(cursor, payment_id, for_update=True)
            if payment["status"] != "BOOKING_IN_PROGRESS":
                raise InvalidPaymentTransition("Travel bookings can only be confirmed after reserving funds.")
            self._execute(cursor, "SELECT items_json FROM bookings WHERE payment_id = ?", (payment_id,))
            booking = cursor.fetchone()
            items = json.loads(booking["items_json"])
            unavailable = [item["name"] for item in items if not item["available"]]
            if unavailable:
                raise PaymentError(f"Simulated provider unavailable for: {', '.join(unavailable)}.")
            self._execute(
                cursor,
                "UPDATE bookings SET status = 'CONFIRMED' WHERE payment_id = ?",
                (payment_id,),
            )
            return self.get_payment_status(payment_id, cursor=cursor)

    def capture_payment(self, payment_id: str) -> dict[str, Any]:
        with self._transaction() as cursor:
            payment = self._payment(cursor, payment_id, for_update=True)
            if payment["status"] == "SUCCESS":
                return self.get_payment_status(payment_id, cursor=cursor)
            if payment["status"] != "BOOKING_IN_PROGRESS":
                raise InvalidPaymentTransition(f"Cannot capture a payment in {payment['status']} state.")
            self._execute(cursor, "SELECT status, items_json FROM bookings WHERE payment_id = ?", (payment_id,))
            booking = cursor.fetchone()
            if booking["status"] != "CONFIRMED":
                raise PaymentError("Funds can only be captured after all simulated bookings are confirmed.")
            items = json.loads(booking["items_json"])
            wallet_query = "SELECT * FROM wallets WHERE wallet_id = ?" + (" FOR UPDATE" if self.postgres_url else "")
            self._execute(cursor, wallet_query, (WALLET_ID,))
            wallet = dict(cursor.fetchone())
            if wallet["reserved_minor"] < payment["amount_minor"]:
                raise PaymentError("Reserved simulated funds do not cover the payment.")
            transaction_id = payment["transaction_id"] or f"TXN-{uuid.uuid4().hex[:16].upper()}"
            self._transition(cursor, payment_id, "CAPTURED")
            self._transition(cursor, payment_id, "SUCCESS")
            self._execute(
                cursor,
                "UPDATE wallets SET reserved_minor = reserved_minor - ? WHERE wallet_id = ?",
                (payment["amount_minor"], WALLET_ID),
            )
            reserved_after = wallet["reserved_minor"] - payment["amount_minor"]
            self._record_ledger(
                cursor,
                payment_id=payment_id,
                booking_id=payment["booking_id"],
                transaction_id=transaction_id,
                idempotency_key=f"capture-wallet:{payment_id}",
                merchant_id=None,
                movement_type="CAPTURE",
                direction="DEBIT",
                amount_minor=payment["amount_minor"],
                balance_before=wallet["reserved_minor"],
                balance_after=reserved_after,
                description="Reserved simulated funds settled to demo merchants.",
            )
            for item_index, item in enumerate(items):
                merchant_id = MERCHANTS[item["category"]]
                merchant_query = "SELECT balance_minor FROM merchants WHERE merchant_id = ?" + (" FOR UPDATE" if self.postgres_url else "")
                self._execute(cursor, merchant_query, (merchant_id,))
                merchant_before = int(cursor.fetchone()["balance_minor"])
                merchant_after = merchant_before + item["amount_minor"]
                self._execute(
                    cursor,
                    "UPDATE merchants SET balance_minor = ? WHERE merchant_id = ?",
                    (merchant_after, merchant_id),
                )
                self._record_ledger(
                    cursor,
                    payment_id=payment_id,
                    booking_id=payment["booking_id"],
                    transaction_id=transaction_id,
                    idempotency_key=f"capture-merchant:{payment_id}:{item['category']}:{item_index}",
                    merchant_id=merchant_id,
                    movement_type="SETTLEMENT",
                    direction="CREDIT",
                    amount_minor=item["amount_minor"],
                    balance_before=merchant_before,
                    balance_after=merchant_after,
                    description=f"Simulated settlement for {item['category']} booking.",
                )
            self._execute(
                cursor,
                "UPDATE payments SET transaction_id = ?, updated_at = ? WHERE payment_id = ?",
                (transaction_id, self._now(), payment_id),
            )
            return self.get_payment_status(payment_id, cursor=cursor)

    def refund_payment(self, payment_id: str, reason: str = "Simulated booking was not completed.") -> dict[str, Any]:
        with self._transaction() as cursor:
            payment = self._payment(cursor, payment_id, for_update=True)
            if payment["status"] == "REFUNDED":
                return self.get_payment_status(payment_id, cursor=cursor)
            if payment["status"] not in {"FUNDS_RESERVED", "BOOKING_IN_PROGRESS", "CAPTURED", "SUCCESS", "REFUND_PENDING"}:
                raise InvalidPaymentTransition(f"Cannot refund a payment in {payment['status']} state.")
            if payment["status"] != "REFUND_PENDING":
                self._transition(cursor, payment_id, "REFUND_PENDING", reason)
            wallet_query = "SELECT * FROM wallets WHERE wallet_id = ?" + (" FOR UPDATE" if self.postgres_url else "")
            self._execute(cursor, wallet_query, (WALLET_ID,))
            wallet = dict(cursor.fetchone())
            self._execute(cursor, "SELECT items_json FROM bookings WHERE payment_id = ?", (payment_id,))
            items = json.loads(cursor.fetchone()["items_json"])
            transaction_id = f"RFN-{uuid.uuid4().hex[:16].upper()}"
            if payment["status"] in {"CAPTURED", "SUCCESS"}:
                for item_index, item in enumerate(items):
                    merchant_id = MERCHANTS[item["category"]]
                    merchant_query = "SELECT balance_minor FROM merchants WHERE merchant_id = ?" + (" FOR UPDATE" if self.postgres_url else "")
                    self._execute(cursor, merchant_query, (merchant_id,))
                    merchant_before = int(cursor.fetchone()["balance_minor"])
                    if merchant_before < item["amount_minor"]:
                        raise PaymentError("Merchant demo balance is insufficient to reverse the simulated settlement.")
                    merchant_after = merchant_before - item["amount_minor"]
                    self._execute(
                        cursor,
                        "UPDATE merchants SET balance_minor = ? WHERE merchant_id = ?",
                        (merchant_after, merchant_id),
                    )
                    self._record_ledger(
                        cursor,
                        payment_id=payment_id,
                        booking_id=payment["booking_id"],
                        transaction_id=transaction_id,
                        idempotency_key=f"refund-merchant:{payment_id}:{item['category']}:{item_index}",
                        merchant_id=merchant_id,
                        movement_type="REFUND",
                        direction="DEBIT",
                        amount_minor=item["amount_minor"],
                        balance_before=merchant_before,
                        balance_after=merchant_after,
                        description="Compensating simulated merchant debit.",
                    )
                before = wallet["available_minor"]
                after = before + payment["amount_minor"]
                self._execute(
                    cursor,
                    "UPDATE wallets SET available_minor = ? WHERE wallet_id = ?",
                    (after, WALLET_ID),
                )
                movement_type = "REFUND"
                direction = "CREDIT"
                balance_before = before
                balance_after = after
                description = "Simulated refund returned from demo merchants to the agent wallet."
            else:
                if wallet["reserved_minor"] < payment["amount_minor"]:
                    raise PaymentError("Reserved balance is insufficient to release this payment.")
                before = wallet["available_minor"]
                after = before + payment["amount_minor"]
                self._execute(
                    cursor,
                    "UPDATE wallets SET available_minor = ?, reserved_minor = reserved_minor - ? WHERE wallet_id = ?",
                    (after, payment["amount_minor"], WALLET_ID),
                )
                movement_type = "RELEASE"
                direction = "CREDIT"
                balance_before = before
                balance_after = after
                description = "Simulated reserved funds released back to the agent wallet."
            self._record_ledger(
                cursor,
                payment_id=payment_id,
                booking_id=payment["booking_id"],
                transaction_id=transaction_id,
                idempotency_key=f"refund-wallet:{payment_id}",
                merchant_id=None,
                movement_type=movement_type,
                direction=direction,
                amount_minor=payment["amount_minor"],
                balance_before=balance_before,
                balance_after=balance_after,
                description=description,
            )
            if payment["status"] not in {"CAPTURED", "SUCCESS"}:
                self._record_ledger(
                    cursor,
                    payment_id=payment_id,
                    booking_id=payment["booking_id"],
                    transaction_id=transaction_id,
                    idempotency_key=f"refund-escrow:{payment_id}",
                    merchant_id=None,
                    movement_type="ESCROW_RELEASE",
                    direction="DEBIT",
                    amount_minor=payment["amount_minor"],
                    balance_before=wallet["reserved_minor"],
                    balance_after=wallet["reserved_minor"] - payment["amount_minor"],
                    description="Simulated escrow reservation reversed after booking failure.",
                )
            self._transition(cursor, payment_id, "REFUNDED")
            self._execute(
                cursor,
                "UPDATE bookings SET status = 'CANCELLED' WHERE payment_id = ?",
                (payment_id,),
            )
            return self.get_payment_status(payment_id, cursor=cursor)

    def fail_payment(self, payment_id: str, reason: str) -> dict[str, Any]:
        with self._transaction() as cursor:
            payment = self._payment(cursor, payment_id, for_update=True)
            if payment["status"] in {"FAILED", "CANCELLED", "REFUNDED"}:
                return self.get_payment_status(payment_id, cursor=cursor)
            if payment["status"] not in {"CREATED", "PENDING", "AUTHORIZED"}:
                raise InvalidPaymentTransition("A reserved payment must be compensated, not marked failed.")
            self._transition(cursor, payment_id, "FAILED", reason)
            self._execute(cursor, "UPDATE bookings SET status = 'FAILED' WHERE payment_id = ?", (payment_id,))
            return self.get_payment_status(payment_id, cursor=cursor)

    def mark_booking_failed(self, payment_id: str, reason: str) -> None:
        with self._transaction() as cursor:
            self._execute(cursor, "UPDATE bookings SET status = 'FAILED' WHERE payment_id = ?", (payment_id,))
            payment = self._payment(cursor, payment_id)
            if payment["status"] == "BOOKING_IN_PROGRESS":
                self._transition(cursor, payment_id, "REFUND_PENDING", reason)

    def save_documents(self, payment_id: str, documents: dict[str, Any]) -> dict[str, Any]:
        with self._transaction() as cursor:
            payment = self._payment(cursor, payment_id)
            if payment["status"] != "SUCCESS":
                raise PaymentError("Booking documents can only be issued after successful simulated payment.")
            self._execute(
                cursor,
                "UPDATE bookings SET documents_json = ? WHERE payment_id = ? AND status = 'CONFIRMED'",
                (json.dumps(documents), payment_id),
            )
            if cursor.rowcount != 1:
                raise PaymentError("Confirmed demo booking was not found for document issuance.")
            return self.get_payment_status(payment_id, cursor=cursor)

    def get_payment_status(self, payment_id: str, cursor=None) -> dict[str, Any]:
        def fetch(active_cursor):
            self._execute(
                active_cursor,
                """SELECT p.*, b.trip_id, b.status AS booking_status, b.items_json, b.documents_json
                   FROM payments p JOIN bookings b ON b.payment_id = p.payment_id
                   WHERE p.payment_id = ?""",
                (payment_id,),
            )
            row = active_cursor.fetchone()
            if row is None:
                raise PaymentError("Payment was not found.")
            result = dict(row)
            result["history"] = json.loads(result.pop("history_json"))
            result["items"] = json.loads(result.pop("items_json"))
            result["documents"] = json.loads(result.pop("documents_json")) if result.get("documents_json") else None
            result.pop("documents_json", None)
            return result

        if cursor is not None:
            return fetch(cursor)
        with self._transaction() as active_cursor:
            return fetch(active_cursor)

    def get_successful_booking_for_trip(self, trip_id: str) -> dict[str, Any] | None:
        with self._transaction() as cursor:
            self._execute(
                cursor,
                """SELECT p.payment_id FROM payments p
                   JOIN bookings b ON b.payment_id = p.payment_id
                   WHERE b.trip_id = ? AND p.status = 'SUCCESS' AND b.status = 'CONFIRMED'
                   ORDER BY p.updated_at DESC LIMIT 1""",
                (trip_id,),
            )
            row = cursor.fetchone()
            return self.get_payment_status(row["payment_id"], cursor=cursor) if row else None

    def get_ledger(self, payment_id: str) -> list[dict[str, Any]]:
        with self._transaction() as cursor:
            self._execute(cursor, "SELECT * FROM ledger WHERE payment_id = ? ORDER BY created_at, ledger_id", (payment_id,))
            return [dict(row) for row in cursor.fetchall()]


# Compatibility name for older TripMate imports and tests.
PaymentService = Wallet

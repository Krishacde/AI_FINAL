from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from services.payment_service import PaymentError, PaymentService


class AutonomousPaymentState(TypedDict, total=False):
    trip_id: str
    booking_id: str
    idempotency_key: str
    payment_id: str
    amount_minor: int
    currency: Literal["INR"]
    items: list[dict[str, Any]]
    payment_status: str
    transaction_id: str | None
    reserved_amount: int
    refund_status: str | None
    booking_status: str
    documents: dict[str, Any] | None
    error: str | None
    progress: list[dict[str, str]]


def _add_progress(state: AutonomousPaymentState, step: str, status: str = "complete") -> list[dict[str, str]]:
    return [*state.get("progress", []), {"step": step, "status": status}]


class SimulatedPaymentAgent:
    """LangGraph orchestration over deterministic PaymentService operations."""

    def __init__(self, service: PaymentService) -> None:
        self.service = service
        graph = StateGraph(AutonomousPaymentState)
        graph.add_node("policy_and_wallet", self._policy_and_wallet)
        graph.add_node("create_payment", self._create_payment)
        graph.add_node("authorize", self._authorize)
        graph.add_node("reserve", self._reserve)
        graph.add_node("confirm_bookings", self._confirm_bookings)
        graph.add_node("capture_and_settle", self._capture)
        graph.add_node("issue_documents", self._issue_documents)
        graph.add_node("compensate", self._compensate)
        graph.add_edge(START, "policy_and_wallet")
        graph.add_edge("policy_and_wallet", "create_payment")
        graph.add_conditional_edges("create_payment", self._next_after_create, {"continue": "authorize", "stop": END})
        graph.add_conditional_edges("authorize", self._next_after_stage, {"continue": "reserve", "compensate": "compensate", "stop": END})
        graph.add_conditional_edges("reserve", self._next_after_stage, {"continue": "confirm_bookings", "compensate": "compensate", "stop": END})
        graph.add_conditional_edges("confirm_bookings", self._next_after_stage, {"continue": "capture_and_settle", "compensate": "compensate", "stop": END})
        graph.add_conditional_edges("capture_and_settle", self._next_after_stage, {"continue": "issue_documents", "compensate": "compensate", "stop": END})
        graph.add_edge("issue_documents", END)
        graph.add_edge("compensate", END)
        self.graph = graph.compile()

    @staticmethod
    def _next_after_create(state: AutonomousPaymentState) -> str:
        return "stop" if state.get("error") or state.get("payment_status") == "SUCCESS" else "continue"

    @staticmethod
    def _next_after_stage(state: AutonomousPaymentState) -> str:
        if not state.get("error"):
            return "continue"
        return "compensate" if state.get("payment_id") else "stop"

    def _policy_and_wallet(self, state: AutonomousPaymentState) -> dict[str, Any]:
        policy = self.service.get_payment_policy()
        wallet = self.service.get_wallet_balance()
        return {
            "progress": _add_progress(
                state,
                f"Simulated payment policy checked; wallet available: {wallet['available_minor']} paise.",
            ),
        }

    def _create_payment(self, state: AutonomousPaymentState) -> dict[str, Any]:
        try:
            payment = self.service.create_payment(
                trip_id=state["trip_id"],
                booking_id=state["booking_id"],
                idempotency_key=state["idempotency_key"],
                items=state["items"],
                currency=state.get("currency", "INR"),
            )
            return {
                "payment_id": payment["payment_id"],
                "amount_minor": payment["amount_minor"],
                "payment_status": payment["status"],
                "booking_status": payment["booking_status"],
                "transaction_id": payment["transaction_id"],
                "documents": payment["documents"],
                "progress": _add_progress(state, "Simulated payment created."),
            }
        except PaymentError as exc:
            return {
                "payment_status": "FAILED",
                "booking_status": "FAILED",
                "error": str(exc),
                "progress": _add_progress(state, str(exc), "failed"),
            }

    def _authorize(self, state: AutonomousPaymentState) -> dict[str, Any]:
        try:
            payment = self.service.authorize_payment(state["payment_id"])
            return {
                "payment_status": payment["status"],
                "progress": _add_progress(state, "Payment policy approved; simulated payment authorized."),
            }
        except PaymentError as exc:
            return {"error": str(exc), "progress": _add_progress(state, str(exc), "failed")}

    def _reserve(self, state: AutonomousPaymentState) -> dict[str, Any]:
        try:
            payment = self.service.reserve_funds(state["payment_id"])
            return {
                "payment_status": payment["status"],
                "reserved_amount": payment["amount_minor"],
                "progress": _add_progress(state, "Simulated funds reserved in escrow."),
            }
        except PaymentError as exc:
            return {"error": str(exc), "progress": _add_progress(state, str(exc), "failed")}

    def _confirm_bookings(self, state: AutonomousPaymentState) -> dict[str, Any]:
        try:
            payment = self.service.mark_booking_confirmed(state["payment_id"])
            return {
                "booking_status": payment["booking_status"],
                "progress": _add_progress(state, "All requested simulated bookings confirmed."),
            }
        except PaymentError as exc:
            try:
                self.service.mark_booking_failed(state["payment_id"], str(exc))
            except PaymentError as compensation_error:
                exc = PaymentError(f"{exc} Compensation failed: {compensation_error}")
            return {"error": str(exc), "booking_status": "FAILED", "progress": _add_progress(state, str(exc), "failed")}

    def _capture(self, state: AutonomousPaymentState) -> dict[str, Any]:
        try:
            payment = self.service.capture_payment(state["payment_id"])
            return {
                "payment_status": payment["status"],
                "transaction_id": payment["transaction_id"],
                "reserved_amount": 0,
                "progress": _add_progress(state, "Sandbox payment captured; sandbox merchant ledger settled."),
            }
        except PaymentError as exc:
            return {"error": str(exc), "progress": _add_progress(state, str(exc), "failed")}

    def _issue_documents(self, state: AutonomousPaymentState) -> dict[str, Any]:
        stamp = "SANDBOX / SIMULATED BOOKING"
        documents: dict[str, Any] = {
            "label": stamp,
            "payment_receipt": {
                "transaction_id": state.get("transaction_id"),
                "payment_id": state["payment_id"],
                "amount_minor": state["amount_minor"],
                "currency": state.get("currency", "INR"),
                "label": stamp,
            },
            "trip_summary": {
                "booking_id": state["booking_id"],
                "trip_id": state["trip_id"],
                "status": "CONFIRMED",
                "label": stamp,
                "items": state["items"],
            },
        }
        document_types = {
            "train": ("train_ticket", "TKT"),
            "hotel": ("hotel_voucher", "HTL"),
            "cab": ("transport_voucher", "CAB"),
            "flight": ("flight_ticket", "FLT"),
            "activity": ("activity_confirmation", "ACT"),
        }
        for category, (document_type, prefix) in document_types.items():
            booked_item = next(
                (item for item in state["items"] if item["category"] == category),
                None,
            )
            if booked_item:
                documents[document_type] = {
                "document_id": f"{prefix}-{uuid.uuid4().hex[:10].upper()}",
                "label": stamp,
                "booking_id": state["booking_id"],
                "details": booked_item["name"],
                **(booked_item.get("metadata") or {}),
            }
        payment = self.service.save_documents(state["payment_id"], documents)
        return {
            "documents": payment["documents"],
            "booking_status": payment["booking_status"],
            "progress": _add_progress(state, "Sandbox booking voucher, receipt, and trip summary issued."),
        }

    def _compensate(self, state: AutonomousPaymentState) -> dict[str, Any]:
        payment_id = state.get("payment_id")
        if not payment_id:
            return {"payment_status": "FAILED", "booking_status": "FAILED"}
        try:
            current = self.service.get_payment_status(payment_id)
            if current["status"] in {"FUNDS_RESERVED", "BOOKING_IN_PROGRESS", "CAPTURED", "SUCCESS", "REFUND_PENDING"}:
                payment = self.service.refund_payment(payment_id, state.get("error") or "Booking failed.")
            else:
                payment = self.service.fail_payment(payment_id, state.get("error") or "Booking failed.")
            return {
                "payment_status": payment["status"],
                "booking_status": payment["booking_status"],
                "refund_status": payment["status"] if payment["status"] in {"REFUND_PENDING", "REFUNDED"} else None,
                "reserved_amount": 0,
                "progress": _add_progress(state, "Compensation completed; simulated funds were released or refunded."),
            }
        except PaymentError as exc:
            return {
                "payment_status": "ERROR",
                "error": f"{state.get('error') or 'Booking failed.'} Compensation failed: {exc}",
                "progress": _add_progress(state, f"Compensation failed: {exc}", "failed"),
            }

    def run(self, trip_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        if not trip_id.strip():
            raise ValueError("Trip identifier is required.")
        booking_digest = hashlib.sha256(
            json.dumps(items, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()[:12].upper()
        digest = hashlib.sha256(
            f"{trip_id}:{booking_digest}".encode("utf-8")
        ).hexdigest()[:12].upper()
        state = self.graph.invoke(
            {
                "trip_id": trip_id,
                "booking_id": f"BK-{digest}",
                "idempotency_key": f"{trip_id}:autonomous-booking:v1:{booking_digest}",
                "items": items,
                "currency": "INR",
                "progress": [],
            }
        )
        payment = None
        if state.get("payment_id"):
            payment = self.service.get_payment_status(state["payment_id"])
        return {
            **state,
            "payment": payment,
            "success": state.get("payment_status") == "SUCCESS" and state.get("booking_status") == "CONFIRMED",
            "money_mode": "SIMULATED_ONLY",
        }

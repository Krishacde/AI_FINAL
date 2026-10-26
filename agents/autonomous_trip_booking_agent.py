from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from agents.simulated_payment_agent import SimulatedPaymentAgent
from backend import MAX_SIMULATED_HOTEL_STAY_INR, TripRequest, gemini

logger = logging.getLogger("tripmate.booking_agent")


class HotelChoice(BaseModel):
    option_index: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=500)


class AutonomousTripBookingAgent:
    """Selects a researched property and submits its validated sandbox quote to payment."""

    def __init__(self, payment_agent: SimulatedPaymentAgent) -> None:
        self.payment_agent = payment_agent

    def run(
        self,
        trip: dict[str, Any],
        request: TripRequest | dict[str, Any],
        option_index: int | None = None,
    ) -> dict[str, Any]:
        req = request if isinstance(request, TripRequest) else TripRequest.model_validate(request)
        hotels = trip.get("hotels") or []
        trip_id = str(trip.get("trip_id") or "")
        if not trip_id:
            return self._skipped("Trip identifier is missing; no payment was attempted.")
        if req.currency != "INR":
            return self._skipped("The simulated payment wallet supports INR trips only.")

        try:
            existing = self.payment_agent.service.get_successful_booking_for_trip(trip_id)
        except Exception:
            logger.exception("Could not check for an earlier successful booking before retry.")
            return self._skipped("Existing booking status could not be verified; no additional payment was attempted.")
        if existing:
            booked_item = next((item for item in existing.get("items", []) if item.get("category") == "hotel"), None)
            requested_hotel = hotels[option_index] if option_index is not None and 0 <= option_index < len(hotels) else None
            same_hotel = requested_hotel is None or requested_hotel.get("name") == (booked_item or {}).get("name")
            if booked_item and same_hotel:
                hotel = next((item for item in hotels if item.get("name") == booked_item.get("name")), None)
                return {
                    "success": True,
                    "status": existing["status"],
                    "booking_status": existing["booking_status"],
                    "booking_id": existing["booking_id"],
                    "payment_id": existing["payment_id"],
                    "transaction_id": existing["transaction_id"],
                    "amount_minor": existing["amount_minor"],
                    "money_mode": "SIMULATED_ONLY",
                    "agent_mode": "idempotent_reuse",
                    "selected_hotel": hotel or {"name": booked_item["name"], "price_num": booked_item["amount_minor"] // 100},
                    "selection_reason": "Returned the existing confirmed booking for this request; no second payment was made.",
                    "progress": [{"step": "Existing successful booking found; reused its receipt and voucher.", "status": "complete"}],
                    "payment": existing,
                }

        try:
            wallet = self.payment_agent.service.get_wallet_balance()
            policy = self.payment_agent.service.get_payment_policy()
        except Exception:
            logger.exception("Could not read wallet or policy before autonomous hotel selection.")
            return self._skipped("Simulated wallet or payment policy could not be checked.")

        budget_minor = int(req.budget * 100) if req.budget is not None else policy["max_transaction_minor"]
        ceiling_minor = min(budget_minor, wallet["available_minor"], policy["max_transaction_minor"])
        candidates: list[dict[str, Any]] = []
        for original_index, hotel in enumerate(hotels):
            quote = hotel.get("quote")
            amount_minor = quote.get("amount_minor") if isinstance(quote, dict) else None
            if (
                not isinstance(quote, dict)
                or quote.get("quote_type") != "SANDBOX"
                or quote.get("currency") != "INR"
                or not isinstance(amount_minor, int)
                or isinstance(amount_minor, bool)
                or amount_minor <= 0
                or amount_minor != hotel.get("price_num", 0) * 100
                or quote.get("check_in") != req.start_date.isoformat()
                or quote.get("check_out") != req.end_date.isoformat()
                or quote.get("travelers") != req.travelers
            ):
                continue
            try:
                expires_at = datetime.fromisoformat(str(quote.get("expires_at")))
                if expires_at.tzinfo is None or expires_at <= datetime.now(timezone.utc):
                    continue
            except (TypeError, ValueError):
                continue
            amount = amount_minor // 100
            if amount > MAX_SIMULATED_HOTEL_STAY_INR or amount_minor > ceiling_minor:
                continue
            candidates.append({"option_index": original_index, "hotel": hotel, "quote": quote, "amount_minor": amount_minor})

        if not candidates:
            return self._skipped("No sandbox hotel quote fits the trip budget, wallet balance, and transaction policy.")

        choice_reason = "Selected the lowest-priced eligible researched option because the language model was unavailable."
        selected = min(candidates, key=lambda entry: (entry["amount_minor"], entry["option_index"]))
        if option_index is not None:
            selected = next((item for item in candidates if item["option_index"] == option_index), None)
            if selected is None:
                return self._skipped("The requested accommodation is outside the trip budget, wallet balance, or payment policy.")
            choice_reason = "Traveler-selected option validated against the trip plan and simulated payment policy."
        else:
            try:
                choice = gemini.structured(
                    "You are the accommodation selection agent. Choose exactly one option from the supplied "
                    "eligible researched hotel options. Honor the traveler's accommodation preference, party size, "
                    "special requirements, destination, and stated budget. Every option is already checked against "
                    "the INR sandbox wallet and payment policy. Do not invent properties, prices, availability, or "
                    "booking facts. Return the original option_index and a concise reason.\n"
                    f"Trip: {req.model_dump(mode='json')}\n"
                    f"Eligible options: {[{'option_index': item['option_index'], 'name': item['hotel'].get('name'), 'area': item['hotel'].get('area'), 'quote': item['quote'], 'amount_minor': item['amount_minor']} for item in candidates]}",
                    HotelChoice,
                )
                if choice:
                    matched = next((item for item in candidates if item["option_index"] == choice.option_index), None)
                    if matched is not None:
                        selected = matched
                        choice_reason = choice.reason
                    else:
                        logger.warning("Accommodation agent returned an option outside its eligible candidates.")
            except Exception:
                logger.exception("Accommodation selection agent failed; using lowest-priced eligible option.")

        hotel = selected["hotel"]
        try:
            payment_result = self.payment_agent.run(
                trip_id,
                [{
                    "category": "hotel",
                    "name": str(hotel.get("name") or "Recommended accommodation")[:160],
                    "amount_minor": selected["amount_minor"],
                    "available": True,
                    "metadata": {
                        "quote_id": selected["quote"]["quote_id"],
                        "quote_type": selected["quote"]["quote_type"],
                        "check_in": selected["quote"]["check_in"],
                        "check_out": selected["quote"]["check_out"],
                        "nights": selected["quote"]["nights"],
                        "rooms": selected["quote"]["rooms"],
                        "travelers": selected["quote"]["travelers"],
                    },
                }],
            )
        except Exception:
            logger.exception("Autonomous simulated hotel payment workflow raised an error.")
            return {
                **self._skipped("The simulated booking workflow failed before it could return a payment result."),
                "selected_hotel": hotel,
                "selection_reason": choice_reason,
            }

        return {
            "success": bool(payment_result.get("success")),
            "status": payment_result.get("payment_status", "FAILED"),
            "booking_status": payment_result.get("booking_status", "FAILED"),
            "booking_id": payment_result.get("booking_id"),
            "payment_id": payment_result.get("payment_id"),
            "transaction_id": payment_result.get("transaction_id"),
            "amount_minor": payment_result.get("amount_minor"),
            "error": payment_result.get("error"),
            "money_mode": "SIMULATED_ONLY",
            "selected_hotel": hotel,
            "selection_reason": choice_reason,
            "agent_mode": payment_result.get("agent_mode"),
            "progress": [
                {"step": f"Traveler selected {hotel.get('name', 'an eligible stay')}; the payment agent validated the quote: {choice_reason}" if option_index is not None else f"Accommodation agent selected {hotel.get('name', 'an eligible stay')}: {choice_reason}", "status": "complete"},
                *payment_result.get("progress", []),
            ],
            "payment": payment_result.get("payment"),
        }

    @staticmethod
    def _skipped(reason: str) -> dict[str, Any]:
        return {
            "success": False,
            "status": "NOT_BOOKED",
            "booking_status": "NOT_BOOKED",
            "error": reason,
            "money_mode": "SIMULATED_ONLY",
            "progress": [{"step": reason, "status": "failed"}],
            "payment": None,
        }

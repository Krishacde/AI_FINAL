# import sys
# import asyncio
# import threading
# import time
# import os
# from pathlib import Path
# # app.py
# # ADD THESE IMPORTS



# import logging
# import traceback
# import uvicorn

# from fastapi import FastAPI, Request

# from fastapi.staticfiles import StaticFiles
# from fastapi.templating import Jinja2Templates
# from pydantic import BaseModel, Field

# from backend import RequestCancelled, TripRequest, run_travel_agent, run_trip, run_discovery, replanning_agent
# from tools.flight_tool import API_KEY as AVIATIONSTACK_API_KEY

# from fastapi.responses import HTMLResponse, JSONResponse
# from pydantic import BaseModel, Field

# from tools.razorpay_payment import (
#     create_hotel_order,
#     verify_hotel_payment,
#     fetch_payment,
#     fetch_order,
# )

# # Reconfigure stdout/stderr for Windows UTF-8 console output
# if sys.platform == "win32":
#     try:
#         sys.stdout.reconfigure(encoding='utf-8', errors='replace')
#         sys.stderr.reconfigure(encoding='utf-8', errors='replace')
#     except Exception:
#         pass

# BASE_DIR = Path(__file__).resolve().parent

# # Edit these two values to tune the request limiter for local or hosted use.
# RATE_LIMIT_WINDOW_SECONDS = 60
# RATE_LIMIT_MAX_REQUESTS = 6
# _rate_limit_history: dict[str, list[float]] = {}
# _rate_limit_lock = threading.Lock()
# logger = logging.getLogger("tripmate.api")
# logger.setLevel(logging.INFO)
# log_formatter = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")



# if not any(isinstance(h, logging.StreamHandler) and not isinstance(h, logging.FileHandler) for h in logger.handlers):
#     console_handler = logging.StreamHandler(sys.stdout)
#     console_handler.setFormatter(log_formatter)
#     logger.addHandler(console_handler)

# if not any(isinstance(handler, logging.FileHandler) for handler in logger.handlers):
#     file_handler = logging.FileHandler(BASE_DIR / "tripmate.log", encoding="utf-8")
#     file_handler.setFormatter(log_formatter)
#     logger.addHandler(file_handler)

# app = FastAPI(
#     title="TripMate AI",
#     description="LangGraph Multi-Agent Travel Planner with FastAPI Frontend",
#     version="2.0.0"
# )

# app.mount(
#     "/static",
#     StaticFiles(directory=str(BASE_DIR / "static")),
#     name="static"
# )

# templates = Jinja2Templates(
#     directory=str(BASE_DIR / "templates")
# )


# def rate_limit_response(request: Request, bucket: str) -> JSONResponse | None:
#     client_key = f"{bucket}:{request.client.host if request.client else 'unknown'}"
#     now = time.monotonic()
#     with _rate_limit_lock:
#         recent = [stamp for stamp in _rate_limit_history.get(client_key, []) if now - stamp < RATE_LIMIT_WINDOW_SECONDS]
#         if len(recent) >= RATE_LIMIT_MAX_REQUESTS:
#             _rate_limit_history[client_key] = recent
#             return JSONResponse(
#                 status_code=429,
#                 content={"success": False, "error": "Too many requests. Please wait before starting another agent run."},
#                 headers={"Retry-After": str(RATE_LIMIT_WINDOW_SECONDS)},
#             )
#         recent.append(now)
#         _rate_limit_history[client_key] = recent
#     return None


# async def run_cancellable(request: Request, operation, *args, **kwargs):
#     cancellation_event = threading.Event()
#     task = asyncio.create_task(asyncio.to_thread(operation, *args, cancellation_event=cancellation_event, **kwargs))
#     while not task.done():
#         await asyncio.wait({task}, timeout=0.25)
#         if await request.is_disconnected():
#             cancellation_event.set()
#             break
#     try:
#         return await task
#     except RequestCancelled:
#         raise


# class TravelRequest(BaseModel):
#     message: str
#     thread_id: str | None = None


# class GuidedTripRequest(TripRequest):
#     thread_id: str | None = None


# class ProviderSelectionRequest(BaseModel):
#     trip_id: str
#     provider_type: str
#     option: dict

# # app.py
# # ADD THESE PYDANTIC MODELS AFTER ProviderSelectionRequest

# class HotelPaymentOrderRequest(BaseModel):
#     trip_id: str
#     hotel: dict
#     travelers: int = Field(default=1, ge=1, le=50)


# class HotelPaymentVerifyRequest(BaseModel):
#     trip_id: str
#     hotel: dict

#     razorpay_order_id: str
#     razorpay_payment_id: str
#     razorpay_signature: str


# class HotelBookingConfirmRequest(BaseModel):
#     trip_id: str
#     hotel: dict

#     razorpay_order_id: str
#     razorpay_payment_id: str


# class DiscoveryQueryRequest(BaseModel):
#     origin: str
#     month: str = "August"
#     year: int = 2026
#     days: int = Field(default=5, ge=1, le=30)
#     start_date: str | None = None
#     end_date: str | None = None
#     travelers: int = 1
#     budget: float | None = None
#     currency: str = "INR"
#     mood: str | None = None
#     interests: list[str] = []
#     weather_preference: str | None = "Pleasant"
#     pace: str | None = "Balanced"
#     accommodation: str | None = "Mid-range hotel"
#     special_requirements: str | None = None


# class ReplanPayload(BaseModel):
#     trip_id: str
#     change_text: str
#     itinerary: list[dict] = []
#     trip_context: dict = {}


# @app.get("/", response_class=HTMLResponse)
# async def home(request: Request):
#     return templates.TemplateResponse(
#         request=request,
#         name="index.html",
#         context={}
#     )


# @app.get("/discover", response_class=HTMLResponse)
# async def discover_page(request: Request):
#     return templates.TemplateResponse(
#         request=request,
#         name="discover.html",
#         context={}
#     )


# @app.post("/api/travel")
# async def travel_planner(request: Request, request_data: TravelRequest):
#     limited = rate_limit_response(request, "travel")
#     if limited:
#         return limited
#     try:
#         user_message = request_data.message.strip()
#         if not user_message:
#             return JSONResponse(
#                 status_code=400,
#                 content={"success": False, "error": "Message cannot be empty."}
#             )

#         result = run_travel_agent(
#             user_input=user_message,
#             thread_id=request_data.thread_id
#         )

#         return JSONResponse(
#             content={
#                 "success": True,
#                 "thread_id": result["thread_id"],
#                 "answer": result["answer"],
#                 "flight_results": result["flight_results"],
#                 "hotel_results": result["hotel_results"],
#                 "itinerary": result["itinerary"],
#                 "llm_calls": result["llm_calls"],
#             }
#         )

#     except Exception as e:
#         logger.exception("travel_planner failed: %s", e)
#         traceback.print_exc()
#         return JSONResponse(
#             status_code=500,
#             content={"success": False, "error": str(e)}
#         )


# @app.post("/api/trips/{trip_id}/selections")
# async def select_provider(
#     trip_id: str,
#     request_data: ProviderSelectionRequest,
# ):
#     """
#     Provider selection router.

#     Hotel:
#         selection -> frontend opens Payment Agent

#     Flight/Cab:
#         existing demo selection behavior
#     """

#     if trip_id != request_data.trip_id:
#         return JSONResponse(
#             status_code=400,
#             content={
#                 "success": False,
#                 "error": "Trip id does not match selection.",
#             },
#         )

#     provider_type = request_data.provider_type

#     if provider_type not in {
#         "flight",
#         "hotel",
#         "cab",
#     }:
#         return JSONResponse(
#             status_code=400,
#             content={
#                 "success": False,
#                 "error": "Unsupported provider selection.",
#             },
#         )

#     option = request_data.option

#     option_name = (
#         option.get("name")
#         or option.get("airline")
#         or "Selected option"
#     )

#     # HOTEL SELECTION
#     #
#     # We intentionally do NOT mark the hotel as booked here.
#     #
#     # The next step is:
#     #
#     # Hotel Selected
#     #      ↓
#     # Payment Agent
#     #      ↓
#     # Razorpay
#     #      ↓
#     # Payment Verification
#     #      ↓
#     # Booking Agent

#     if provider_type == "hotel":
#         return {
#             "success": True,
#             "trip_id": trip_id,
#             "selection": {
#                 "type": "hotel",
#                 "name": option_name,
#                 "option": option,
#             },
#             "next_action": "PAYMENT_REQUIRED",
#             "payment_required": True,
#             "message": (
#                 f"{option_name} selected. "
#                 "Payment is required to confirm accommodation."
#             ),
#         }

#     # Existing behavior for flight/cab
#     detail = (
#         option.get("flight_number")
#         or option.get("area")
#         or option.get("location")
#         or "provider option"
#     )

#     label = {
#         "flight": "flight",
#         "cab": "transport",
#     }[provider_type]

#     return {
#         "success": True,
#         "trip_id": trip_id,
#         "selection": {
#             "type": provider_type,
#             "name": option_name,
#             "option": option,
#         },
#         "itinerary_update": {
#             "time": "Plan update",
#             "title": f"Selected {label}: {option_name}",
#             "description": (
#                 f"{detail} added to the plan. "
#                 "Connected provider APIs can replace this estimate."
#             ),
#         },
#         "message": (
#             f"{option_name} added. "
#             "Your itinerary was refreshed."
#         ),
#     }

# @app.post("/api/trips")
# async def create_trip(request: Request, request_data: GuidedTripRequest):
#     """Run the evidence-first LangGraph planner with structured user choices."""
#     limited = rate_limit_response(request, "trip")
#     if limited:
#         return limited
#     try:
#         payload = request_data.model_dump(mode="json", exclude={"thread_id"})
#         logger.info("request=trip_create status=started thread_id=%s destination=%s", request_data.thread_id or "new", payload.get("destination"))
#         trip = await run_cancellable(request, run_trip, payload, request_data.thread_id)
#         return JSONResponse(content={"success": True, "trip": trip})
#     except RequestCancelled:
#         return JSONResponse(status_code=499, content={"success": False, "cancelled": True, "error": "Trip research cancelled."})
#     except Exception as exc:
#         logger.exception("request=trip_create status=failed error=%s", exc)
#         traceback.print_exc()
#         return JSONResponse(status_code=400, content={"success": False, "error": str(exc)})


# @app.post("/api/discover")
# async def discover_destinations(request: Request, request_data: DiscoveryQueryRequest):
#     """Run LangGraph Multi-Agent Discovery Pipeline to find clean, ranked destination cards."""
#     limited = rate_limit_response(request, "discover")
#     if limited:
#         return limited
#     try:
#         logger.info(
#             "request=destination_discovery status=started origin=%s month=%s year=%s",
#             request_data.origin, request_data.month, request_data.year
#         )
#         discovery_result = await run_cancellable(request, run_discovery,
#             origin=request_data.origin.strip(),
#             month=request_data.month.strip(),
#             year=request_data.year,
#             days=request_data.days,
#             interests=request_data.interests,
#             mood=request_data.mood
#         )
#         return JSONResponse(content={
#             "success": True,
#             "destinations": discovery_result["destinations"],
#             "scout_summary": discovery_result["scout_summary"],
#             "progress": discovery_result["progress"],
#             "warnings": discovery_result["warnings"]
#         })
#     except RequestCancelled:
#         return JSONResponse(status_code=499, content={"success": False, "cancelled": True, "error": "Destination research cancelled."})
#     except Exception as exc:
#         logger.exception("request=destination_discovery status=failed error=%s", exc)
#         traceback.print_exc()
#         return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


# @app.post("/api/trips/replan")
# async def replan_itinerary(request: Request, request_data: ReplanPayload):
#     """Run ReplanningAgent to adjust itinerary based on user input without full regeneration."""
#     limited = rate_limit_response(request, "replan")
#     if limited:
#         return limited
#     try:
#         logger.info("request=trip_replan status=started trip_id=%s change=%s", request_data.trip_id, request_data.change_text)
#         result = replanning_agent(
#             change_text=request_data.change_text,
#             current_itinerary=request_data.itinerary,
#             trip_context=request_data.trip_context
#         )
#         return JSONResponse(content={"success": True, **result})
#     except Exception as exc:
#         logger.exception("request=trip_replan status=failed error=%s", exc)
#         traceback.print_exc()
#         return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


# @app.get("/api/diagnostics")
# async def diagnostics():
#     """Report integration readiness without exposing secret values."""
#     def key_state(name: str) -> str:
#         value = os.getenv(name, "").strip()
#         if not value:
#             return "missing"
#         if value.lower().startswith("your_") or value.lower() in {"change_me", "placeholder"}:
#             return "placeholder"
#         return "configured"

#     keys = {
#         "GEMINI_API_KEY": key_state("GEMINI_API_KEY"),
#         "TAVILY_API_KEY": key_state("TAVILY_API_KEY"),
#         "AVIATIONSTACK_API_KEY": key_state("AVIATIONSTACK_API_KEY"),
#         "DATABASE_URL": key_state("DATABASE_URL"),
#          "RAZORPAY_KEY_ID": key_state("RAZORPAY_KEY_ID"),
#     "RAZORPAY_KEY_SECRET": key_state("RAZORPAY_KEY_SECRET"),
#     }
#     logger.info("request=diagnostics keys=%s", keys)
#     return {
#         "status": "ok",
#         "keys": {name: "configured" if value else "missing" for name, value in keys.items()},
#         "notes": {
#             "AVIATIONSTACK_API_KEY": "Live flight status lookup.",
#             "GEMINI_API_KEY": "Required for multi-agent reasoning, ranking, planning and replanning.",
#             "TAVILY_API_KEY": "Required for web research, verified events, and hotel evidence.",
#             "RAZORPAY_KEY_ID": "Razorpay Test Mode checkout key.",
#     "RAZORPAY_KEY_SECRET": "Server-side Razorpay Test Mode secret."
#         }
#     }


# @app.get("/health")
# async def health_check():
#     return {
#         "status": "ok",
#         "message": "TripMate AI Multi-Agent Planner is running"
#     }


# @app.get("/favicon.ico")
# async def favicon():
#     return JSONResponse(content={})

# @app.post("/api/payments/hotel/order")
# async def create_hotel_payment_order(
#     request_data: HotelPaymentOrderRequest,
# ):
#     """
#     Payment Agent:
#     Creates a Razorpay Test Mode order for hotel accommodation.
#     """

#     try:
#         trip_id = request_data.trip_id
#         hotel = request_data.hotel

#         hotel_name = (
#             hotel.get("name")
#             or hotel.get("hotel_name")
#             or hotel.get("title")
#             or "Selected Hotel"
#         )

#         price = hotel.get("price_num")

#         if price is None:
#             price = hotel.get("price")

#         if price is None:
#             return JSONResponse(
#                 status_code=400,
#                 content={
#                     "success": False,
#                     "error": "Hotel price is missing."
#                 },
#             )

#         # Handle values such as:
#         # 4500
#         # "4500"
#         # "₹4,500"
#         if isinstance(price, str):
#             cleaned_price = (
#                 price.replace("₹", "")
#                 .replace(",", "")
#                 .replace("INR", "")
#                 .strip()
#             )

#             try:
#                 price = float(cleaned_price)
#             except ValueError:
#                 return JSONResponse(
#                     status_code=400,
#                     content={
#                         "success": False,
#                         "error": f"Invalid hotel price: {price}"
#                     },
#                 )

#         price = float(price)

#         if price <= 0:
#             return JSONResponse(
#                 status_code=400,
#                 content={
#                     "success": False,
#                     "error": "Hotel price must be greater than zero."
#                 },
#             )

#         order = create_hotel_order(
#             hotel_name=hotel_name,
#             amount_inr=price,
#             trip_id=trip_id,
#             travelers=request_data.travelers,
#         )

#         logger.info(
#             "PAYMENT AGENT | hotel order created | trip=%s | order=%s | amount=%s",
#             trip_id,
#             order["id"],
#             order["amount"],
#         )

#         return {
#             "success": True,
#             "payment_status": "ORDER_CREATED",
#             "agent": "PaymentAgent",
#             "order": order,
#         }

#     except Exception as e:
#         logger.exception(
#             "Hotel payment order creation failed: %s",
#             e,
#         )

#         return JSONResponse(
#             status_code=500,
#             content={
#                 "success": False,
#                 "error": str(e),
#             },
#         )
# @app.post("/api/payments/hotel/verify")
# async def verify_hotel_payment_api(
#     request_data: HotelPaymentVerifyRequest,
# ):
#     """
#     Deterministic Payment Verification Node.

#     IMPORTANT:
#     The LLM does NOT decide whether payment succeeded.
#     Razorpay signature + Razorpay payment status are authoritative.
#     """

#     try:
#         valid_signature = verify_hotel_payment(
#             razorpay_order_id=request_data.razorpay_order_id,
#             razorpay_payment_id=request_data.razorpay_payment_id,
#             razorpay_signature=request_data.razorpay_signature,
#         )

#         if not valid_signature:
#             logger.warning(
#                 "PAYMENT VERIFICATION FAILED | trip=%s | order=%s",
#                 request_data.trip_id,
#                 request_data.razorpay_order_id,
#             )

#             return JSONResponse(
#                 status_code=400,
#                 content={
#                     "success": False,
#                     "payment_status": "VERIFICATION_FAILED",
#                     "error": "Invalid Razorpay payment signature.",
#                 },
#             )

#         # Verify actual payment with Razorpay
#         payment = fetch_payment(
#             request_data.razorpay_payment_id
#         )

#         payment_status = payment.get("status")

#         logger.info(
#             "PAYMENT VERIFICATION | trip=%s | payment=%s | status=%s",
#             request_data.trip_id,
#             request_data.razorpay_payment_id,
#             payment_status,
#         )

#         if payment_status != "captured":
#             return JSONResponse(
#                 status_code=400,
#                 content={
#                     "success": False,
#                     "payment_status": payment_status,
#                     "error": (
#                         "Payment signature is valid, "
#                         "but payment is not captured."
#                     ),
#                 },
#             )

#         return {
#             "success": True,
#             "payment_status": "PAID",
#             "verified": True,
#             "agent": "PaymentVerificationNode",
#             "trip_id": request_data.trip_id,
#             "payment": {
#                 "payment_id": request_data.razorpay_payment_id,
#                 "order_id": request_data.razorpay_order_id,
#                 "status": payment_status,
#                 "amount": payment.get("amount"),
#                 "currency": payment.get("currency"),
#                 "method": payment.get("method"),
#             },
#         }

#     except Exception as e:
#         logger.exception(
#             "Hotel payment verification failed: %s",
#             e,
#         )

#         return JSONResponse(
#             status_code=500,
#             content={
#                 "success": False,
#                 "payment_status": "VERIFICATION_ERROR",
#                 "error": str(e),
#             },
#         )
# @app.post("/api/trips/{trip_id}/accommodation/confirm")
# async def confirm_accommodation_booking(
#     trip_id: str,
#     request_data: HotelBookingConfirmRequest,
# ):
#     """
#     Booking Agent.

#     This runs ONLY after Payment Verification succeeds.
#     """

#     if trip_id != request_data.trip_id:
#         return JSONResponse(
#             status_code=400,
#             content={
#                 "success": False,
#                 "error": "Trip ID mismatch."
#             },
#         )

#     try:
#         hotel = request_data.hotel

#         hotel_name = (
#             hotel.get("name")
#             or hotel.get("hotel_name")
#             or hotel.get("title")
#             or "Selected Hotel"
#         )

#         booking_id = (
#             f"HTL-{uuid.uuid4().hex[:10].upper()}"
#         )

#         booking = {
#             "booking_id": booking_id,
#             "booking_type": "accommodation",
#             "status": "CONFIRMED",
#             "hotel": hotel_name,
#             "hotel_details": hotel,
#             "trip_id": trip_id,
#             "payment": {
#                 "status": "PAID",
#                 "razorpay_order_id": request_data.razorpay_order_id,
#                 "razorpay_payment_id": request_data.razorpay_payment_id,
#             },
#         }

#         logger.info(
#             "BOOKING AGENT | accommodation confirmed | trip=%s | booking=%s",
#             trip_id,
#             booking_id,
#         )

#         return {
#             "success": True,
#             "agent": "AccommodationBookingAgent",
#             "booking": booking,
#             "itinerary_update": {
#                 "type": "accommodation",
#                 "title": f"Hotel confirmed: {hotel_name}",
#                 "description": (
#                     f"{hotel_name} has been confirmed "
#                     "after successful payment."
#                 ),
#                 "status": "CONFIRMED",
#             },
#             "message": (
#                 f"{hotel_name} confirmed successfully."
#             ),
#         }

#     except Exception as e:
#         logger.exception(
#             "Accommodation confirmation failed: %s",
#             e,
#         )

#         return JSONResponse(
#             status_code=500,
#             content={
#                 "success": False,
#                 "error": str(e),
#             },
#         )


# if __name__ == "__main__":
#     uvicorn.run(
#         "app:app",
#         host="127.0.0.1",
#         port=8000,
#         reload=False
#     )


#     # app.py
# # ADD THESE ENDPOINTS

# @app.post("/api/payments/hotel/order")
# async def create_hotel_payment_order(
#     request: Request,
#     request_data: HotelPaymentOrderRequest,
# ):
#     """
#     Create a Razorpay TEST MODE order for accommodation.

#     Only hotel/accommodation payments are enabled currently.
#     Flights/cabs are intentionally not handled here yet.
#     """

#     try:
#         hotel = request_data.hotel or {}

#         hotel_name = (
#             hotel.get("name")
#             or hotel.get("hotel_name")
#             or "Accommodation"
#         )

#         # Your existing CleanHotelCard contains price_num.
#         # Example:
#         # price_num = 13500
#         amount = hotel.get("price_num")

#         if amount is None:
#             total_price = hotel.get("total_price")

#             if isinstance(total_price, str):
#                 import re

#                 numbers = re.findall(
#                     r"[\d,]+(?:\.\d+)?",
#                     total_price,
#                 )

#                 if numbers:
#                     amount = float(numbers[0].replace(",", ""))

#         if amount is None:
#             return JSONResponse(
#                 status_code=400,
#                 content={
#                     "success": False,
#                     "error": "Hotel price is missing."
#                 },
#             )

#         try:
#             amount = float(amount)
#         except (TypeError, ValueError):
#             return JSONResponse(
#                 status_code=400,
#                 content={
#                     "success": False,
#                     "error": "Invalid hotel price."
#                 },
#             )

#         if amount <= 0:
#             return JSONResponse(
#                 status_code=400,
#                 content={
#                     "success": False,
#                     "error": "Hotel price must be greater than zero."
#                 },
#             )

#         order = create_hotel_order(
#             hotel_name=hotel_name,
#             amount_inr=amount,
#             trip_id=request_data.trip_id,
#             travelers=request_data.travelers,
#         )

#         return JSONResponse(
#             content={
#                 "success": True,
#                 "payment": {
#                     "key_id": order["key_id"],
#                     "order_id": order["id"],
#                     "amount": order["amount"],
#                     "currency": order["currency"],
#                     "hotel_name": order["hotel_name"],
#                     "trip_id": order["trip_id"],
#                     "booking_type": "accommodation",
#                 },
#             }
#         )

#     except Exception as exc:
#         logger.exception(
#             "hotel_payment_order_failed: %s",
#             exc,
#         )

#         return JSONResponse(
#             status_code=500,
#             content={
#                 "success": False,
#                 "error": str(exc),
#             },
#         )


# @app.post("/api/payments/hotel/verify")
# async def verify_hotel_payment_endpoint(
#     request_data: HotelPaymentVerifyRequest,
# ):
#     """
#     Verify Razorpay payment signature.

#     Payment is considered successful only after this
#     server-side verification succeeds.
#     """

#     try:
#         valid = verify_hotel_payment(
#             razorpay_order_id=request_data.razorpay_order_id,
#             razorpay_payment_id=request_data.razorpay_payment_id,
#             razorpay_signature=request_data.razorpay_signature,
#         )

#         if not valid:
#             return JSONResponse(
#                 status_code=400,
#                 content={
#                     "success": False,
#                     "payment_verified": False,
#                     "error": "Invalid Razorpay payment signature.",
#                 },
#             )

#         payment = fetch_payment(
#             request_data.razorpay_payment_id
#         )

#         payment_status = payment.get("status")

#         return JSONResponse(
#             content={
#                 "success": True,
#                 "payment_verified": True,
#                 "booking_type": "accommodation",
#                 "trip_id": request_data.trip_id,
#                 "hotel": request_data.hotel,
#                 "payment": {
#                     "payment_id": request_data.razorpay_payment_id,
#                     "order_id": request_data.razorpay_order_id,
#                     "status": payment_status,
#                     "amount": payment.get("amount"),
#                     "currency": payment.get("currency"),
#                     "method": payment.get("method"),
#                 },
#                 "message": (
#                     "Accommodation payment verified successfully."
#                     if payment_status == "captured"
#                     else f"Payment verified. Razorpay status: {payment_status}"
#                 ),
#             }
#         )

#     except Exception as exc:
#         logger.exception(
#             "hotel_payment_verification_failed: %s",
#             exc,
#         )

#         return JSONResponse(
#             status_code=500,
#             content={
#                 "success": False,
#                 "payment_verified": False,
#                 "error": str(exc),
#             },
#         )

import sys
import asyncio
import threading
import time
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Reconfigure stdout/stderr for Windows UTF-8 console output
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import logging
import traceback
import uvicorn

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, StrictInt

from agents.simulated_payment_agent import SimulatedPaymentAgent
from agents.autonomous_trip_booking_agent import AutonomousTripBookingAgent
from agents.payment_llm import PaymentLLM
from backend import RequestCancelled, TripRequest, run_trip, run_discovery, replanning_agent
from tools.flight_tool import API_KEY as AVIATIONSTACK_API_KEY
from tools.train_tool import RAILRADAR_API_KEY, search_trains
from services.wallet import PaymentError, Wallet
from services.sandbox_quotes import create_sandbox_cab_quote, create_sandbox_schedule_quote
from services.result_cache import result_cache
from services.trip_store import trip_store

BASE_DIR = Path(__file__).resolve().parent

# Edit these two values to tune the request limiter for local or hosted use.
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 6
_rate_limit_history: dict[str, list[float]] = {}
_rate_limit_lock = threading.Lock()
logger = logging.getLogger("tripmate.api")
logger.setLevel(logging.INFO)
log_formatter = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")

if not any(isinstance(h, logging.StreamHandler) and not isinstance(h, logging.FileHandler) for h in logger.handlers):
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(log_formatter)
    logger.addHandler(console_handler)

if not any(isinstance(handler, logging.FileHandler) for handler in logger.handlers):
    file_handler = logging.FileHandler(BASE_DIR / "tripmate.log", encoding="utf-8")
    file_handler.setFormatter(log_formatter)
    logger.addHandler(file_handler)

app = FastAPI(
    title="TripMate AI",
    description="LangGraph Multi-Agent Travel Planner with FastAPI Frontend",
    version="2.0.0"
)

app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "static")),
    name="static"
)

REACT_DIST_DIR = BASE_DIR / "frontend" / "dist"
REACT_INDEX = REACT_DIST_DIR / "index.html"
REACT_ASSETS_DIR = REACT_DIST_DIR / "assets"
if REACT_ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(REACT_ASSETS_DIR)), name="react-assets")

templates = Jinja2Templates(
    directory=str(BASE_DIR / "templates")
)

_simulated_payment_agent: SimulatedPaymentAgent | None = None
_simulated_payment_agent_lock = threading.Lock()
_autonomous_booking_agent: AutonomousTripBookingAgent | None = None
_autonomous_booking_agent_lock = threading.Lock()


def rate_limit_response(request: Request, bucket: str) -> JSONResponse | None:
    client_key = f"{bucket}:{request.client.host if request.client else 'unknown'}"
    now = time.monotonic()
    with _rate_limit_lock:
        recent = [stamp for stamp in _rate_limit_history.get(client_key, []) if now - stamp < RATE_LIMIT_WINDOW_SECONDS]
        if len(recent) >= RATE_LIMIT_MAX_REQUESTS:
            _rate_limit_history[client_key] = recent
            return JSONResponse(
                status_code=429,
                content={"success": False, "error": "Too many requests. Please wait before starting another agent run."},
                headers={"Retry-After": str(RATE_LIMIT_WINDOW_SECONDS)},
            )
        recent.append(now)
        _rate_limit_history[client_key] = recent
    return None


async def run_cancellable(request: Request, operation, *args, **kwargs):
    cancellation_event = threading.Event()
    task = asyncio.create_task(asyncio.to_thread(operation, *args, cancellation_event=cancellation_event, **kwargs))
    while not task.done():
        await asyncio.wait({task}, timeout=0.25)
        if await request.is_disconnected():
            cancellation_event.set()
            break
    try:
        return await task
    except RequestCancelled:
        raise


class GuidedTripRequest(TripRequest):
    thread_id: str | None = None
    request_id: str | None = Field(default=None, min_length=8, max_length=100)


class ProviderSelectionRequest(BaseModel):
    trip_id: str
    provider_type: str
    option: dict
    trip_context: dict = {}


class DemoWalletTopUpRequest(BaseModel):
    amount_minor: StrictInt = Field(gt=0, le=100_000_000)
    idempotency_key: str = Field(min_length=1, max_length=160)


class DiscoveryQueryRequest(BaseModel):
    origin: str
    month: str = "August"
    year: int = 2026
    days: int = Field(default=5, ge=1, le=30)
    start_date: str | None = None
    end_date: str | None = None
    travelers: int = 1
    budget: float | None = None
    currency: str = "INR"
    mood: str | None = None
    interests: list[str] = []
    weather_preference: str | None = "Pleasant"
    pace: str | None = "Balanced"
    accommodation: str | None = "Mid-range hotel"
    special_requirements: str | None = None


class ReplanPayload(BaseModel):
    trip_id: str
    change_text: str
    itinerary: list[dict] = []
    trip_context: dict = {}
    expected_version: int | None = None


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    if REACT_INDEX.is_file():
        return FileResponse(REACT_INDEX, media_type="text/html")
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={}
    )


@app.get("/discover", response_class=HTMLResponse)
async def discover_page(request: Request):
    if REACT_INDEX.is_file():
        return FileResponse(REACT_INDEX, media_type="text/html")
    return templates.TemplateResponse(
        request=request,
        name="discover.html",
        context={}
    )


@app.get("/payment-demo")
async def payment_demo_page():
    return JSONResponse(
        status_code=410,
        content={"success": False, "error": "Interactive checkout has been retired; use the autonomous simulated booking flow."},
    )


@app.post("/api/payments/hotel/agent/start")
@app.post("/api/payments/hotel/agent/complete")
@app.post("/api/payments/hotel/agent/continue/{session_id}")
@app.post("/api/payments/hotel/agent/stop/{session_id}")
@app.post("/api/payments/hotel/agent/retry/{session_id}")
@app.post("/api/payments/hotel/order")
@app.post("/api/payments/hotel/verify")
async def retired_real_payment_routes(session_id: str | None = None):
    return JSONResponse(
        status_code=410,
        content={"success": False, "error": "Real payment and interactive checkout endpoints are disabled. No money is charged."},
    )


def get_simulated_payment_agent() -> SimulatedPaymentAgent:
    global _simulated_payment_agent
    if _simulated_payment_agent is None:
        with _simulated_payment_agent_lock:
            if _simulated_payment_agent is None:
                try:
                    payment_llm = PaymentLLM.from_env()
                except RuntimeError as exc:
                    logger.warning("Payment LLM is not configured; guarded offline tools will be used: %s", exc)
                    payment_llm = None
                _simulated_payment_agent = SimulatedPaymentAgent(Wallet(), llm=payment_llm)
    return _simulated_payment_agent


def get_autonomous_booking_agent() -> AutonomousTripBookingAgent:
    global _autonomous_booking_agent
    if _autonomous_booking_agent is None:
        with _autonomous_booking_agent_lock:
            if _autonomous_booking_agent is None:
                _autonomous_booking_agent = AutonomousTripBookingAgent(get_simulated_payment_agent())
    return _autonomous_booking_agent


def attach_booking_to_trip(trip: dict, booking: dict, trip_request: dict | None = None) -> None:
    trip["demo_booking"] = booking
    hotel = booking.get("selected_hotel")
    if not booking.get("success") or not hotel:
        return
    start_date = (trip_request or trip.get("request") or {}).get("start_date")
    amount = booking.get("amount_minor", 0) / 100
    quote = hotel.get("quote") or {}
    entry = {
        "date": quote.get("check_in") or start_date,
        "start_time": "14:00",
        "end_time": "15:00",
        "title": hotel.get("name", "Accommodation"),
        "location": hotel.get("area") or trip.get("selected_destination"),
        "description": f"{quote.get('nights', 1)} night(s), {quote.get('rooms', 1)} room(s). Booking confirmed.",
        "estimated_cost": amount,
        "cost_status": "SANDBOX_CONFIRMED",
        "reason": "Autonomous sandbox booking",
        "booking_id": booking.get("booking_id"),
        "document_id": (booking.get("payment") or {}).get("documents", {}).get("hotel_voucher", {}).get("document_id"),
    }
    activities = trip.setdefault("itinerary", [])
    activities[:] = [item for item in activities if item.get("reason") != "Autonomous sandbox booking"]
    activities.insert(0, entry)


def existing_booking_view(payment: dict, hotels: list[dict]) -> dict | None:
    item = next((row for row in payment.get("items", []) if row.get("category") == "hotel"), None)
    if not item:
        return None
    metadata = item.get("metadata") or {}
    hotel = next((row for row in hotels if row.get("name") == item.get("name")), None)
    hotel = dict(hotel or {"name": item["name"]})
    hotel["price_num"] = item["amount_minor"] // 100
    hotel["quote"] = {
        **metadata,
        "amount_minor": item["amount_minor"],
        "currency": payment.get("currency", "INR"),
        "provider": "TripMate sandbox inventory",
        "quote_type": metadata.get("quote_type", "SANDBOX"),
    }
    return {
        "success": True,
        "status": payment["status"],
        "booking_status": payment["booking_status"],
        "booking_id": payment["booking_id"],
        "payment_id": payment["payment_id"],
        "transaction_id": payment.get("transaction_id"),
        "amount_minor": payment["amount_minor"],
        "money_mode": "SIMULATED_ONLY",
        "selected_hotel": hotel,
        "selection_reason": "Existing sandbox reservation preserved; no second charge was created.",
        "payment": payment,
    }


def booking_for_ui(booking: dict[str, Any] | None) -> dict[str, Any] | None:
    """Keep internal agent traces in server logs, not in customer-facing API payloads."""
    if not isinstance(booking, dict):
        return booking
    return {key: value for key, value in booking.items() if key not in {"progress", "agent_mode", "trace", "agent_note", "error"}}


def trip_for_ui(trip: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(trip, dict):
        return trip
    result = dict(trip)
    if isinstance(result.get("sandbox_bookings"), list):
        result["sandbox_bookings"] = [booking_for_ui(row) for row in result["sandbox_bookings"]]
    if isinstance(result.get("demo_booking"), dict):
        result["demo_booking"] = booking_for_ui(result["demo_booking"])
    return result


@app.post("/api/demo/bookings")
@app.post("/api/sandbox/bookings")
def create_autonomous_demo_booking():
    return JSONResponse(
        status_code=410,
        content={"success": False, "error": "Booking runs automatically with trip planning. Start a trip to let the agents select an eligible sandbox quote, pay, and issue booking documents."},
    )


@app.get("/api/demo/wallet")
@app.get("/api/sandbox/wallet")
def get_demo_wallet():
    try:
        return get_simulated_payment_agent().service.get_wallet_balance()
    except Exception:
        logger.exception("Could not read simulated wallet balance.")
        return JSONResponse(
            status_code=503,
            content={"success": False, "error": "The simulated wallet is temporarily unavailable."},
        )


@app.post("/api/demo/wallet/topups")
@app.post("/api/sandbox/wallet/topups")
def top_up_demo_wallet(request: Request, request_data: DemoWalletTopUpRequest):
    limited = rate_limit_response(request, "wallet-topup")
    if limited:
        return limited
    try:
        wallet = get_simulated_payment_agent().service.add_simulated_funds(
            request_data.amount_minor, request_data.idempotency_key
        )
        return {"success": True, "money_mode": "SIMULATED_ONLY", "wallet": wallet}
    except PaymentError as exc:
        return JSONResponse(status_code=422, content={"success": False, "error": str(exc)})
    except Exception:
        logger.exception("Could not add simulated funds to the demo wallet.")
        return JSONResponse(status_code=503, content={"success": False, "error": "The simulated wallet is temporarily unavailable."})


@app.get("/api/demo/payments/{payment_id}")
@app.get("/api/sandbox/payments/{payment_id}")
def get_demo_payment(payment_id: str):
    try:
        return get_simulated_payment_agent().service.get_payment_status(payment_id)
    except PaymentError as exc:
        return JSONResponse(status_code=404, content={"success": False, "error": str(exc)})
    except Exception:
        logger.exception("Could not read simulated payment %s.", payment_id)
        return JSONResponse(
            status_code=503,
            content={"success": False, "error": "The simulated payment service is temporarily unavailable."},
        )


@app.get("/api/trips")
async def list_saved_trips():
    """List durable trip summaries; payment status is never read from Redis."""
    return {"success": True, "trips": trip_store.list_trips()}


@app.get("/api/trips/{trip_id}")
async def get_saved_trip(trip_id: str):
    trip = trip_store.get_trip(trip_id)
    if trip is None:
        return JSONResponse(status_code=404, content={"success": False, "error": "Saved trip not found."})

    # Repair saved trips created by the old station resolver automatically.
    # This prevents a previously persisted ambiguity/no-results message from
    # surviving after the station resolver and schedule fallback are updated.
    train_search = trip.get("train_search") if isinstance(trip.get("train_search"), dict) else {}
    old_message = str(train_search.get("message") or "").casefold()
    old_rows = trip.get("trains") if isinstance(trip.get("trains"), list) else []
    if old_rows and isinstance(old_rows[0], dict):
        old_message = old_message or str(old_rows[0].get("message") or old_rows[0].get("error") or "").casefold()
    stale_train_result = (
        "multiple stations" in old_message
        or "no scheduled trains for this route and date" in old_message
        or (bool(old_rows) and train_search.get("fare_lookup_status") != "COMPLETED")
    )
    if stale_train_result:
        request_data = trip.get("request") if isinstance(trip.get("request"), dict) else {}
        origin = str(request_data.get("origin") or "").strip()
        destination = str(trip.get("selected_destination") or request_data.get("destination") or "").strip()
        travel_date = str(request_data.get("start_date") or "").strip()
        if origin and destination and travel_date:
            result = await asyncio.to_thread(search_trains, origin, destination, travel_date, 5)
            trip["trains"] = result.get("trains", [])
            trip["train_search"] = {
                "status": result.get("status"),
                "message": result.get("message"),
                "source": "RailRadar",
                "requested_date": result.get("requested_date"),
                "suggested_dates": result.get("suggested_dates", []),
                "fare_lookup_status": result.get("fare_lookup_status"),
            }
            persistence = trip_store.save_trip(trip, change_summary="Train schedules refreshed by TrainAgent")
            trip["current_version"] = persistence["version"]
            trip["updated_at"] = persistence["updated_at"]
    return {"success": True, "trip": trip_for_ui(trip)}


@app.get("/api/trips/{trip_id}/messages")
async def get_trip_messages(trip_id: str):
    if trip_store.get_trip(trip_id) is None:
        return JSONResponse(status_code=404, content={"success": False, "error": "Saved trip not found."})
    return {"success": True, "messages": trip_store.get_messages(trip_id)}


@app.get("/api/trips/{trip_id}/versions")
async def get_trip_versions(trip_id: str):
    if trip_store.get_trip(trip_id) is None:
        return JSONResponse(status_code=404, content={"success": False, "error": "Saved trip not found."})
    return {"success": True, "versions": trip_store.get_versions(trip_id)}


@app.patch("/api/trips/{trip_id}")
async def rename_saved_trip(trip_id: str, request_data: dict[str, Any]):
    try:
        if "itinerary_items" in request_data:
            trip = trip_store.get_trip(trip_id)
            if trip is None:
                return JSONResponse(status_code=404, content={"success": False, "error": "Saved trip not found."})
            if not isinstance(request_data["itinerary_items"], list):
                return JSONResponse(status_code=422, content={"success": False, "error": "itinerary_items must be a list."})
            trip["itinerary_items"] = request_data["itinerary_items"]
            trip_store.save_trip(trip, change_summary=str(request_data.get("change_summary") or "Trip plan updated"))
        if "name" in request_data and not trip_store.rename_trip(trip_id, str(request_data["name"])):
            return JSONResponse(status_code=404, content={"success": False, "error": "Saved trip not found."})
        return {"success": True, "trip": trip_for_ui(trip_store.get_trip(trip_id))}
    except ValueError as exc:
        return JSONResponse(status_code=422, content={"success": False, "error": str(exc)})


@app.delete("/api/trips/{trip_id}")
async def delete_saved_trip(trip_id: str):
    if not trip_store.delete_trip(trip_id):
        return JSONResponse(status_code=404, content={"success": False, "error": "Saved trip not found."})
    return {"success": True, "trip_id": trip_id}


def persist_trip_booking(trip_id: str, provider_type: str, option: dict[str, Any], booking: dict[str, Any]) -> dict[str, Any] | None:
    """Persist confirmed booking references alongside the trip after ledger success."""
    payment = booking.get("payment") or {}
    if not (booking.get("success") and payment.get("status") == "SUCCESS" and payment.get("booking_status") == "CONFIRMED"):
        return None
    trip = trip_store.get_trip(trip_id)
    if trip is None:
        return None
    records = trip.get("sandbox_bookings") or []
    payment_id = payment.get("payment_id") or booking.get("payment_id")
    if payment_id and any((row.get("payment") or {}).get("payment_id") == payment_id for row in records):
        return trip
    records.append(booking_for_ui(booking))
    trip["sandbox_bookings"] = records
    activities = list(trip.get("itinerary_items") or trip.get("itinerary") or [])
    item_name = str(option.get("name") or option.get("airline") or option.get("train_name") or option.get("train_number") or "Selected service")
    amount = float(payment.get("amount_minor", 0)) / 100
    if provider_type == "hotel":
        activities = [row for row in activities if not row.get("is_hotel_entry")]
        activities.append({"date": (option.get("quote") or {}).get("check_in") or (trip.get("request") or {}).get("start_date"),
                           "start_time": "14:00", "end_time": "15:00", "title": item_name,
                           "location": option.get("area") or trip.get("selected_destination"), "status": "SANDBOX_CONFIRMED",
                           "cost": amount, "is_hotel_entry": True, "booking_id": booking.get("booking_id")})
    elif provider_type == "cab":
        activities = [row for row in activities if not row.get("is_cab_entry")]
        activities.append({"date": (option.get("quote") or {}).get("travel_date") or (trip.get("request") or {}).get("start_date"),
                           "start_time": "12:00", "end_time": "13:00", "title": item_name,
                           "location": option.get("route") or trip.get("selected_destination"), "status": "SANDBOX_CONFIRMED",
                           "cost": amount, "is_cab_entry": True, "booking_id": booking.get("booking_id")})
    elif provider_type in {"flight", "train"}:
        marker = "is_flight_entry" if provider_type == "flight" else "is_train_entry"
        category = "flight" if provider_type == "flight" else "train"
        doc_key = "flight_ticket" if category == "flight" else "train_ticket"
        document = (payment.get("documents") or {}).get(doc_key) or {}
        activities = [row for row in activities if not row.get(marker)]
        activities.append({"date": (option.get("quote") or {}).get("travel_date") or (trip.get("request") or {}).get("start_date"),
                           "start_time": option.get("departure") or option.get("departure_time") or "",
                           "end_time": option.get("arrival") or option.get("arrival_time") or "",
                           "title": item_name,
                           "location": option.get("route") or f"{option.get('departure_station') or (trip.get('request') or {}).get('origin', '')} → {option.get('arrival_station') or trip.get('selected_destination', '')}",
                           "description": "Simulated booking record and ticket document. No supplier inventory was reserved.",
                           "status": "SANDBOX_CONFIRMED", "cost": amount, marker: True,
                           "booking_id": booking.get("booking_id"), "document_id": document.get("document_id")})
    trip["itinerary_items"] = activities
    trip_store.save_trip(trip, change_summary=f"Sandbox {provider_type} booking confirmed")
    return trip_for_ui(trip_store.get_trip(trip_id))


@app.post("/api/trips/{trip_id}/selections")
async def select_provider(
    trip_id: str,
    request_data: ProviderSelectionRequest,
):
    """
    Provider selection router.

    A traveler selects the service; the payment agent validates and books it.
    """

    if trip_id != request_data.trip_id:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "Trip id does not match selection.",
            },
        )

    if request_data.provider_type not in {"flight", "train", "hotel", "cab"}:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "Unsupported provider selection.",
            },
        )

    option_name = (
        request_data.option.get("name")
        or request_data.option.get("airline")
        or request_data.option.get("train_name")
        or request_data.option.get("train_number")
        or "Selected option"
    )

    if request_data.provider_type == "hotel":
        context = request_data.trip_context
        try:
            trip_request = TripRequest.model_validate({
                **context,
                "destination": context.get("destination") or request_data.option.get("destination"),
                "origin": context.get("origin") or "Unknown origin",
                "currency": "INR",
            })
            booking = await asyncio.to_thread(
                get_autonomous_booking_agent().run,
                {"trip_id": trip_id, "hotels": [request_data.option]},
                trip_request,
                0,
            )
        except Exception as exc:
            logger.exception("Traveler-selected hotel sandbox booking failed.")
            return JSONResponse(status_code=400, content={"success": False, "error": str(exc)})
        saved_trip = persist_trip_booking(trip_id, "hotel", request_data.option, booking)
        return JSONResponse(
            status_code=200 if booking.get("success") else 402,
            content={"success": bool(booking.get("success")), "trip_id": trip_id,
                     "selection": {"type": "hotel", "name": option_name},
                     "sandbox_booking": booking_for_ui(booking),
                     "trip": saved_trip,
                     "message": "Booking confirmed." if booking.get("success") else "Payment couldn’t be completed. Please try again."},
        )

    if request_data.provider_type == "cab":
        context = request_data.trip_context
        cab_quote = request_data.option.get("quote") or {}
        route = str(request_data.option.get("route") or context.get("destination") or "Local transfer")
        travel_date = str(context.get("start_date") or "")
        try:
            authoritative_quote = create_sandbox_cab_quote(name=str(option_name), route=route, travel_date=travel_date)
        except ValueError as exc:
            return JSONResponse(status_code=400, content={"success": False, "error": str(exc)})
        try:
            expires_at = datetime.fromisoformat(str(cab_quote.get("expires_at")))
            quote_is_current = expires_at.tzinfo is not None and expires_at > datetime.now(timezone.utc)
        except (TypeError, ValueError):
            quote_is_current = False
        if (not quote_is_current or cab_quote.get("quote_id") != authoritative_quote["quote_id"]
                or cab_quote.get("amount_minor") != authoritative_quote["amount_minor"]):
            return JSONResponse(status_code=409, content={"success": False, "error": "Transport quote is stale or invalid. Refresh the plan and select again."})
        cab_result = await asyncio.to_thread(
            get_simulated_payment_agent().run,
            trip_id,
            [{"category": "cab", "name": str(option_name)[:160], "amount_minor": authoritative_quote["amount_minor"],
              "available": True, "metadata": {"route": str(request_data.option.get("route") or context.get("destination") or "Local transfer"),
              "travel_date": travel_date, "quote_id": authoritative_quote["quote_id"], "quote_type": "SANDBOX"}}],
        )
        saved_trip = persist_trip_booking(trip_id, "cab", request_data.option, cab_result)
        return JSONResponse(
            status_code=200 if cab_result.get("success") else 402,
            content={"success": bool(cab_result.get("success")), "trip_id": trip_id,
                     "selection": {"type": "cab", "name": option_name},
                     "sandbox_booking": booking_for_ui(cab_result),
                     "trip": saved_trip,
                     "message": "Booking confirmed." if cab_result.get("success") else "Payment couldn’t be completed. Please try again."},
        )

    if request_data.provider_type in {"flight", "train"}:
        quote = request_data.option.get("quote") or {}
        saved = trip_store.get_trip(trip_id)
        saved_request = (saved or {}).get("request") or {}
        catalog = (saved or {}).get("flights" if request_data.provider_type == "flight" else "trains") or []
        identity = ("flight_number", "airline") if request_data.provider_type == "flight" else ("train_number", "train_name")
        def option_key(row):
            return tuple(str(row.get(key) or row.get("name") or "").strip().casefold() for key in identity)
        trusted = next((row for row in catalog if option_key(row) == option_key(request_data.option)), None)
        if not trusted or (trusted.get("quote") or {}).get("quote_id") != quote.get("quote_id"):
            return JSONResponse(status_code=409, content={"success": False, "error": "This schedule quote is missing, stale, or does not belong to the saved trip. Refresh the trip and select again."})
        category = request_data.provider_type
        route = f"{saved_request.get('origin', '')} → {(saved or {}).get('selected_destination') or saved_request.get('destination') or ''}"
        travel_date = str(trusted.get("travel_date") or saved_request.get("start_date") or "")
        try:
            authoritative = create_sandbox_schedule_quote(category=category, name=str(option_name), route=route,
                                                          travel_date=travel_date, travelers=int(saved_request.get("travelers") or 1))
            expiry = datetime.fromisoformat(str(quote.get("expires_at")))
            current = expiry.tzinfo is not None and expiry > datetime.now(timezone.utc)
        except (TypeError, ValueError):
            current = False
            authoritative = {}
        if not current or quote.get("quote_id") != authoritative.get("quote_id") or quote.get("amount_minor") != authoritative.get("amount_minor"):
            return JSONResponse(status_code=409, content={"success": False, "error": "This simulated quote expired or changed. Refresh the trip and select again."})
        amount = authoritative["amount_minor"]
        result = await asyncio.to_thread(get_simulated_payment_agent().run, trip_id,
            [{"category": category, "name": str(option_name)[:160], "amount_minor": amount, "available": True,
              "metadata": {"route": route, "travel_date": travel_date, "quote_id": authoritative["quote_id"],
                           "quote_type": authoritative["quote_type"], "provider": authoritative["provider"]}}])
        saved_trip = persist_trip_booking(trip_id, category, trusted, result)
        return JSONResponse(status_code=200 if result.get("success") else 402,
            content={"success": bool(result.get("success")), "trip_id": trip_id,
                     "selection": {"type": category, "name": option_name}, "sandbox_booking": booking_for_ui(result),
                     "trip": saved_trip, "message": "Booking confirmed." if result.get("success") else "Payment couldn’t be completed. Please try again."})
    return JSONResponse(status_code=400, content={"success": False, "error": "Unsupported provider selection."})


@app.post("/api/trips")
async def create_trip(request: Request, request_data: GuidedTripRequest):
    """Run the evidence-first LangGraph planner with structured user choices."""
    limited = rate_limit_response(request, "trip")
    if limited:
        return limited
    try:
        payload = request_data.model_dump(mode="json", exclude={"thread_id", "request_id"})
        logger.info("request=trip_create status=started thread_id=%s destination=%s", request_data.thread_id or "new", payload.get("destination"))
        trip = await run_cancellable(
            request,
            run_trip,
            payload,
            request_data.thread_id,
            trip_id=request_data.request_id or str(uuid.uuid4()),
        )
        route = f"{payload.get('origin', '')} → {trip.get('selected_destination') or payload.get('destination') or ''}"
        for flight in trip.get("flights", []):
            if isinstance(flight, dict) and flight.get("status") != "UNAVAILABLE" and (flight.get("airline") or flight.get("flight_number")):
                flight["quote"] = create_sandbox_schedule_quote(category="flight", name=str(flight.get("name") or flight.get("airline") or flight.get("flight_number")),
                    route=route, travel_date=str(payload.get("start_date") or ""), travelers=int(payload.get("travelers") or 1))
        for train in trip.get("trains", []):
            if isinstance(train, dict) and (train.get("train_name") or train.get("train_number")):
                train["quote"] = create_sandbox_schedule_quote(category="train", name=str(train.get("name") or train.get("train_name") or train.get("train_number")),
                    route=route, travel_date=str(train.get("travel_date") or payload.get("start_date") or ""), travelers=int(payload.get("travelers") or 1))
        # The traveler selects a priced service first. Payment starts only after
        # an explicit selection through /api/trips/{trip_id}/selections.
        trip["demo_booking"] = None
        destination = str(trip.get("selected_destination") or payload.get("destination") or "destination")
        route = f"Local transfer · {destination}"
        trip["cabs"] = []
        for cab_name, vehicle, duration in [
            ("Local Sedan Transfer", "AC sedan · up to 3 passengers", "Point-to-point local service"),
            ("Local SUV Transfer", "AC SUV · up to 5 passengers", "Point-to-point local service"),
            ("Local Van Transfer", "AC van · up to 8 passengers", "Point-to-point local service"),
        ]:
            quote = create_sandbox_cab_quote(name=cab_name, route=route, travel_date=str(payload["start_date"]))
            trip["cabs"].append({"name": cab_name, "route": route, "vehicle": vehicle, "duration": duration,
                                 "price_num": quote["amount_minor"] // 100, "price": f"₹{quote['amount_minor'] // 100:,} sandbox total",
                                 "quote": quote, "status": "SANDBOX_QUOTE"})
        trip["request"] = payload
        persistence = trip_store.save_trip(trip, change_summary="Initial itinerary generated")
        trip["current_version"] = persistence["version"]
        trip["created_at"] = persistence["created_at"]
        trip["updated_at"] = persistence["updated_at"]
        trip_store.add_message(trip["trip_id"], "user", f"Plan a trip to {destination} from {payload.get('origin')}.")
        trip_store.add_message(trip["trip_id"], "assistant", "Initial itinerary generated by the travel-planning workflow.")
        return JSONResponse(content={"success": True, "trip": trip_for_ui(trip)})
    except RequestCancelled:
        return JSONResponse(status_code=499, content={"success": False, "cancelled": True, "error": "Trip research cancelled."})
    except Exception as exc:
        logger.exception("request=trip_create status=failed error=%s", exc)
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"success": False, "error": str(exc)})


@app.post("/api/discover")
async def discover_destinations(request: Request, request_data: DiscoveryQueryRequest):
    """Run LangGraph Multi-Agent Discovery Pipeline to find clean, ranked destination cards."""
    limited = rate_limit_response(request, "discover")
    if limited:
        return limited
    try:
        logger.info(
            "request=destination_discovery status=started origin=%s month=%s year=%s",
            request_data.origin, request_data.month, request_data.year
        )
        discovery_result = await run_cancellable(request, run_discovery,
            origin=request_data.origin.strip(),
            month=request_data.month.strip(),
            year=request_data.year,
            days=request_data.days,
            interests=request_data.interests,
            mood=request_data.mood
        )
        return JSONResponse(content={
            "success": True,
            "destinations": discovery_result["destinations"],
            "scout_summary": discovery_result["scout_summary"],
            "progress": discovery_result["progress"],
            "warnings": discovery_result["warnings"]
        })
    except RequestCancelled:
        return JSONResponse(status_code=499, content={"success": False, "cancelled": True, "error": "Destination research cancelled."})
    except Exception as exc:
        logger.exception("request=destination_discovery status=failed error=%s", exc)
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


@app.post("/api/trips/replan")
async def replan_itinerary(request: Request, request_data: ReplanPayload):
    """Run ReplanningAgent to adjust itinerary based on user input without full regeneration."""
    limited = rate_limit_response(request, "replan")
    if limited:
        return limited
    try:
        logger.info("request=trip_replan status=started trip_id=%s change=%s", request_data.trip_id, request_data.change_text)
        stored_trip = trip_store.get_trip(request_data.trip_id)
        if stored_trip and request_data.expected_version is not None and request_data.expected_version != stored_trip.get("current_version"):
            return JSONResponse(status_code=409, content={"success": False, "error": "This itinerary has changed since it was loaded. Refresh the saved trip before applying another edit."})
        current_items = stored_trip.get("itinerary_items") or stored_trip.get("itinerary") or [] if stored_trip else request_data.itinerary
        agent_itinerary = [item for item in current_items if isinstance(item, dict) and not (item.get("is_flight_entry") or item.get("is_train_entry") or item.get("is_hotel_entry") or item.get("is_cab_entry"))]
        saved_request = (stored_trip or {}).get("request") or {}
        agent_context = {
            **request_data.trip_context,
            **{key: value for key, value in saved_request.items() if value is not None},
            "destination": stored_trip.get("selected_destination") or saved_request.get("destination") if stored_trip else request_data.trip_context.get("destination"),
        }
        result = await asyncio.to_thread(
            replanning_agent,
            change_text=request_data.change_text,
            current_itinerary=agent_itinerary,
            trip_context=agent_context,
        )
        if stored_trip and isinstance(result.get("itinerary"), list):
            old_items = stored_trip.get("itinerary_items") or stored_trip.get("itinerary") or []
            preserved = [item for item in old_items if isinstance(item, dict) and (item.get("is_flight_entry") or item.get("is_train_entry") or item.get("is_hotel_entry") or item.get("is_cab_entry"))]
            stored_trip["itinerary_items"] = preserved + result["itinerary"]
            stored_trip["itinerary"] = result["itinerary"]
            if result.get("hotel_search_performed"):
                stored_trip["hotels"] = result.get("updated_hotels") or []
            version_record = trip_store.save_trip(stored_trip, change_summary=result.get("change_summary") or request_data.change_text)
            stored_trip["current_version"] = version_record["version"]
            trip_store.add_message(request_data.trip_id, "user", request_data.change_text)
            trip_store.add_message(request_data.trip_id, "assistant", result.get("change_summary") or "Itinerary updated by the replanning workflow.")
            result["trip"] = stored_trip
        if "progress" in result:
            result.pop("progress", None)
        if isinstance(result.get("trip"), dict):
            result["trip"] = trip_for_ui(result["trip"])
        # Replanning changes the itinerary only. It must never choose or buy a
        # newly suggested hotel; the traveler can select it from refreshed cards.
        return JSONResponse(content={"success": True, **result})
    except Exception as exc:
        logger.exception("request=trip_replan status=failed error=%s", exc)
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


@app.get("/api/diagnostics")
async def diagnostics():
    """Report integration readiness without exposing secret values."""
    def key_state(name: str) -> str:
        value = os.getenv(name, "").strip()
        if not value:
            return "missing"
        if value.lower().startswith("your_") or value.lower() in {"change_me", "placeholder"}:
            return "placeholder"
        return "configured"

    keys = {
        "GEMINI_API_KEY": key_state("GEMINI_API_KEY"),
        "TAVILY_API_KEY": key_state("TAVILY_API_KEY"),
        "AVIATIONSTACK_API_KEY": key_state("AVIATIONSTACK_API_KEY"),
        "RAILRADAR_API_KEY": key_state("RAILRADAR_API_KEY"),
        "DATABASE_URL": key_state("DATABASE_URL"),
    }
    logger.info("request=diagnostics keys=%s", keys)
    return {
        "status": "ok",
        "keys": keys,
        "cache": result_cache.status(),
        "notes": {
            "AVIATIONSTACK_API_KEY": "Live flight status lookup.",
            "RAILRADAR_API_KEY": "Optional RailRadar schedule and fare quote lookup; does not provide seat reservation or ticketing.",
            "GEMINI_API_KEY": "Required for multi-agent reasoning, ranking, planning and replanning.",
            "TAVILY_API_KEY": "Required for web research, verified events, and hotel evidence."
        }
    }


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "TripMate AI Multi-Agent Planner is running"
    }


@app.get("/favicon.ico")
async def favicon():
    return JSONResponse(content={})


@app.get("/{frontend_path:path}", response_class=HTMLResponse)
async def react_client_route(frontend_path: str):
    """Serve the React app for client-side routes while keeping unknown APIs 404."""
    if frontend_path.startswith(("api/", "static/", "assets/")):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    built_index = BASE_DIR / "frontend" / "dist" / "index.html"
    if built_index.is_file():
        return FileResponse(built_index)
    return JSONResponse(status_code=404, content={"detail": "Frontend build not found. Run npm run build."})


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="127.0.0.1",
        port=8000,
        # This entry point is the local development server. Reloading prevents
        # the UI from continuing to call an old imported train resolver after
        # backend source changes.
        reload=True,
        reload_dirs=[str(BASE_DIR)],
    )

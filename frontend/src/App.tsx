import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import { DiscoveryPage } from "./DiscoveryPage";
import { PlannerForm, type Handoff } from "./PlannerForm";
import { TripResults } from "./TripResults";
import type { Activity, Trip, TripMessage, TripRequest, TravelOption, Wallet } from "./types";
import { useLocation, useNavigate } from "react-router-dom";

const TRIP_STORAGE_KEY = "tripmate-react-last-trip-v1";
const HANDOFF_KEY = "tripmate-react-discovery-handoff-v1";

function readHandoff(): Handoff | null {
  try { const value = sessionStorage.getItem(HANDOFF_KEY); return value ? JSON.parse(value) as Handoff : null; } catch { return null; }
}

function buildTrip(request: TripRequest, response: Trip): Trip {
  const destination = response.selected_destination || request.destination || request.selected_destinations.join(", ");
  const activities = (response.itinerary || []).map((activity) => ({
    ...activity,
    date: activity.date || request.start_date,
    start_time: activity.start_time || "",
    end_time: activity.end_time || "",
    title: activity.title || "Untitled activity",
    location: activity.location || destination,
    status: activity.booking_id ? "SANDBOX_CONFIRMED" : activity.cost_status || "PLANNED",
    cost: activity.estimated_cost == null ? null : Number(activity.estimated_cost),
    is_hotel_entry: Boolean(activity.booking_id),
  }));
  return {
    ...response,
    trip_id: response.trip_id || crypto.randomUUID(),
    request,
    selected_destination: destination,
    itinerary_items: activities,
    flights: response.flights || [],
    hotels: response.hotels || [],
    cabs: response.cabs || [],
    sandbox_bookings: response.sandbox_bookings || [],
  };
}

function currency(minor: number | undefined) {
  return `₹${((minor || 0) / 100).toLocaleString("en-IN")}`;
}

function renderSandboxCheckout(
  popup: Window | null,
  details: { name: string; amount: string; state: "processing" | "success" | "failed"; booking?: Record<string, unknown>; message?: string },
) {
  if (!popup || popup.closed) return;
  const document = popup.document;
  document.head.innerHTML = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;padding:28px;display:grid;place-items:center;color:#edf5ff;background:radial-gradient(ellipse at 14% 0%,#173f53 0,transparent 42%),linear-gradient(145deg,#081321,#10213a);font:15px Inter,system-ui,Segoe UI,sans-serif}
    .shell{width:min(560px,100%);padding:clamp(22px,6vw,38px);border:1px solid #ffffff20;border-radius:26px;background:#0e2037eF;box-shadow:0 28px 90px #0008;animation:rise .35s ease both}.brand{display:flex;align-items:center;gap:10px;color:#aaf2df;font-size:12px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}.mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid #79e4d044;border-radius:11px;background:#79e4d012;font-size:18px}h1{margin:26px 0 8px;font-size:clamp(25px,7vw,34px);letter-spacing:-.045em}.muted{color:#a8bad1;line-height:1.6}.summary{display:flex;justify-content:space-between;gap:18px;margin:24px 0;padding:17px;border:1px solid #ffffff18;border-radius:16px;background:#ffffff06}.summary small,.meta{display:block;color:#95aac3}.summary strong{display:block;margin-top:5px}.amount{color:#aaf2df;font-size:22px;white-space:nowrap}.pill{display:inline-flex;gap:8px;align-items:center;padding:8px 11px;border:1px solid #79e4d033;border-radius:99px;color:#b9f5e6;background:#79e4d00b;font-size:12px;font-weight:750}.spinner{width:13px;height:13px;border:2px solid #79e4d04a;border-top-color:#79e4d0;border-radius:50%;animation:spin .8s linear infinite}.steps{display:grid;gap:10px;margin:22px 0;padding:0;list-style:none}.steps li{display:flex;gap:10px;align-items:center;color:#c5d5e8}.steps li:before{content:'✓';display:grid;place-items:center;width:21px;height:21px;border-radius:50%;color:#aaf2df;background:#79e4d018;font-size:12px}.steps.processing li:before{content:'·';color:#9eb3ca;background:#ffffff0d}.message{padding:13px 14px;border:1px solid #fb718533;border-radius:12px;color:#fecaca;background:#fb71830c;line-height:1.55}.message.ok{border-color:#79e4d033;color:#baf3e5;background:#79e4d00c}.actions{display:flex;justify-content:flex-end;margin-top:22px}.actions button{min-height:44px;padding:10px 15px;border:0;border-radius:12px;color:#08251f;background:linear-gradient(115deg,#91f0d8,#69d8c5);font:inherit;font-weight:800;cursor:pointer}.foot{margin-top:22px;padding-top:16px;border-top:1px solid #ffffff14;color:#8398b1;font-size:12px;line-height:1.5}@keyframes spin{to{transform:rotate(360deg)}}@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important}}
  </style>`;
  document.title = "TripMate · Sandbox checkout";
  document.body.innerHTML = `<main class="shell"><div class="brand"><span class="mark">✦</span>TripMate · Sandbox</div><h1 id="title"></h1><p id="description" class="muted"></p><section class="summary"><div><small>Selected service</small><strong id="service"></strong><small id="reference" class="meta"></small></div><strong id="amount" class="amount"></strong></section><div id="status"></div><ol id="steps" class="steps"></ol><div id="message"></div><div class="actions"><button id="return" type="button">Return to trip</button></div><p class="foot">Sandbox transaction only. No real payment is collected and no supplier inventory is reserved.</p></main>`;
  document.querySelector<HTMLButtonElement>("#return")?.addEventListener("click", () => popup.close());
  document.querySelector("#service")!.textContent = details.name;
  document.querySelector("#amount")!.textContent = details.amount;
  const title = document.querySelector("#title")!;
  const description = document.querySelector("#description")!;
  const status = document.querySelector("#status")!;
  const steps = document.querySelector<HTMLOListElement>("#steps")!;
  const message = document.querySelector("#message")!;
  if (details.state === "processing") {
    title.textContent = "Your booking is in progress";
    description.textContent = "The payment agent is validating the server quote and wallet policy, then recording the sandbox booking.";
    status.innerHTML = '<span class="pill"><span class="spinner"></span>Agent processing</span>';
    steps.classList.add("processing");
    ["Validating the selected quote", "Checking wallet and transaction limits", "Recording the booking and receipt"].forEach((label) => { const row = document.createElement("li"); row.textContent = label; steps.append(row); });
  } else if (details.state === "success") {
    title.textContent = "Sandbox booking confirmed";
    description.textContent = "The backend confirmed the payment and saved the booking to your trip.";
    status.innerHTML = '<span class="pill">✓ Backend verified</span>';
    const bookingId = String(details.booking?.booking_id || "Booking reference not returned");
    document.querySelector("#reference")!.textContent = `Booking reference · ${bookingId}`;
    const progress = Array.isArray(details.booking?.progress) ? details.booking.progress : [];
    progress.forEach((item) => { const row = document.createElement("li"); row.textContent = String((item as Record<string, unknown>).step || (item as Record<string, unknown>).label || "Payment step"); steps.append(row); });
    const paymentMessage = document.createElement("p"); paymentMessage.className = "message ok"; paymentMessage.textContent = "The returned booking documents are available in the trip plan."; message.append(paymentMessage);
  } else {
    title.textContent = "Booking not completed";
    description.textContent = "The backend did not confirm this sandbox transaction. Your itinerary remains saved.";
    status.innerHTML = '<span class="pill">Transaction not confirmed</span>';
    const failure = document.createElement("p"); failure.className = "message"; failure.textContent = details.message || "No successful payment was returned."; message.append(failure);
  }
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDiscovery = location.pathname.replace(/\/$/, "") === "/discover";
  const routeTripId = decodeURIComponent(location.pathname.match(/^\/trips\/([^/]+)\/?$/)?.[1] || "");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [savedTrips, setSavedTrips] = useState<Array<{ trip_id: string; name: string; destination?: string; updated_at: string; current_version: number }>>([]);
  const [conversation, setConversation] = useState<TripMessage[]>([]);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(() => readHandoff());
  const [tripBusy, setTripBusy] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [tripProgress, setTripProgress] = useState<string | null>(null);
  const tripController = useRef<AbortController | null>(null);
  const tripSequence = useRef(0);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [topUp, setTopUp] = useState("10000");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [replanBusy, setReplanBusy] = useState(false);
  const [replanError, setReplanError] = useState<string | null>(null);
  const [replanProgress, setReplanProgress] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [legacyMessage, setLegacyMessage] = useState("");
  const [legacyThreadId, setLegacyThreadId] = useState<string | undefined>();
  const [legacyAnswer, setLegacyAnswer] = useState<string | null>(null);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const verifiedPaymentIds = useRef(new Set<string>());
  const selectionController = useRef<AbortController | null>(null);
  const replanSequence = useRef(0);

  const refreshWallet = useCallback(async () => {
    try { setWallet(await api.wallet()); setWalletError(null); }
    catch (cause) { setWalletError(cause instanceof Error ? cause.message : "Wallet unavailable."); }
  }, []);

  useEffect(() => { if (trip) { try { localStorage.setItem(TRIP_STORAGE_KEY, trip.trip_id); } catch { /* the backend remains authoritative */ } } }, [trip]);
  useEffect(() => {
    if (isDiscovery) return;
    void refreshWallet();
    api.diagnostics().then(setDiagnostics).catch((cause) => setDiagnosticsError(cause instanceof Error ? cause.message : "Diagnostics unavailable."));
    let active = true;
    const requestedTrip = routeTripId || localStorage.getItem(TRIP_STORAGE_KEY) || "";
    api.savedTrips().then(({ trips }) => { if (active) setSavedTrips(trips); }).catch(() => { if (active) setSavedTrips([]); });
    if (!requestedTrip) { setTrip(null); setConversation([]); setRestoreError(null); return () => { active = false; }; }
    api.getTrip(requestedTrip).then(({ trip: restored }) => {
      if (!active) return;
      const records = restored.sandbox_bookings || (restored.demo_booking ? [restored.demo_booking] : []);
      setTrip({ ...restored, sandbox_bookings: records.map((booking) => ({ ...booking, success: false, status: "VERIFYING", payment: booking.payment ? { ...booking.payment, status: "VERIFYING" } : booking.payment })) });
      api.tripMessages(requestedTrip).then(({ messages }) => { if (active) setConversation(messages as TripMessage[]); }).catch(() => { if (active) setConversation([]); });
      setRestoreError(null);
    }).catch((cause) => {
      if (!active) return;
      setTrip(null);
      setRestoreError(cause instanceof Error ? cause.message : "Could not restore the saved trip.");
      localStorage.removeItem(TRIP_STORAGE_KEY);
    });
    return () => { active = false; };
  }, [isDiscovery, refreshWallet, routeTripId]);

  useEffect(() => {
    if (!trip) return;
    const bookings = trip.sandbox_bookings || (trip.demo_booking ? [trip.demo_booking] : []);
    for (const booking of bookings) {
      const paymentId = booking.payment?.payment_id || booking.payment_id;
      if (!paymentId || verifiedPaymentIds.current.has(paymentId)) continue;
      verifiedPaymentIds.current.add(paymentId);
      api.payment(paymentId).then((fresh) => {
        setTrip((current) => current ? {
          ...current,
          sandbox_bookings: (current.sandbox_bookings || (current.demo_booking ? [current.demo_booking] : [])).map((item) =>
            (item.payment?.payment_id || item.payment_id) === paymentId
              ? { ...item, success: fresh.status === "SUCCESS" && fresh.booking_status === "CONFIRMED", status: fresh.status, booking_status: fresh.booking_status, amount_minor: fresh.amount_minor, payment: fresh }
              : item),
        } : current);
      }).catch((cause) => setPaymentError(cause instanceof Error ? `Could not refresh saved payment status: ${cause.message}` : "Could not refresh saved payment status."));
    }
  }, [trip?.sandbox_bookings]);

  async function createTrip(request: TripRequest) {
    tripController.current?.abort();
    const controller = new AbortController(); tripController.current = controller;
    const requestNumber = ++tripSequence.current;
    setConversation([]);
    setTripBusy(true); setTripError(null); setTripProgress("The planning graph is researching your trip. Detailed agent results will appear when the backend responds.");
    try {
      const result = await api.createTrip({ ...request, request_id: crypto.randomUUID() }, controller.signal);
      if (requestNumber !== tripSequence.current) return;
      const next = buildTrip(request, result.trip);
      setTrip(next); sessionStorage.removeItem(HANDOFF_KEY); setTripError(null);
      api.tripMessages(next.trip_id).then(({ messages }) => setConversation(messages as TripMessage[])).catch(() => setConversation([]));
      localStorage.setItem(TRIP_STORAGE_KEY, next.trip_id);
      navigate(`/trips/${encodeURIComponent(next.trip_id)}`);
      api.savedTrips().then(({ trips }) => setSavedTrips(trips)).catch(() => undefined);
      document.getElementById("trip-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") setTripError("Trip research was paused. Your form entries are still available.");
      else setTripError(cause instanceof Error ? cause.message : "Could not generate the trip plan.");
    } finally {
      if (requestNumber === tripSequence.current) { setTripBusy(false); setTripProgress(null); tripController.current = null; }
    }
  }

  function openDiscovery() { navigate("/discover"); }

  function handleHandoff(value: Handoff) {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(value));
    setHandoff(value);
    setTrip(null);
    setConversation([]);
    localStorage.removeItem(TRIP_STORAGE_KEY);
    const params = new URLSearchParams({ destination: value.destinations.join(", "), origin: value.origin,
      start_date: value.start_date, end_date: value.end_date, pace: value.pace || "balanced", from_discovery: "true", autostart: "true" });
    if (value.budget != null) params.set("budget", String(value.budget));
    navigate(`/?${params.toString()}`);
  }

  async function openSavedTrip(tripId: string) {
    try {
      const response = await api.getTrip(tripId);
      localStorage.setItem(TRIP_STORAGE_KEY, tripId);
      setTrip(response.trip);
      const messages = await api.tripMessages(tripId);
      setConversation(messages.messages as TripMessage[]);
      setRestoreError(null);
      navigate(`/trips/${encodeURIComponent(tripId)}`);
    } catch (cause) { setRestoreError(cause instanceof Error ? cause.message : "Could not open this saved trip."); }
  }

  function startNewTrip() {
    setTrip(null);
    setConversation([]);
    localStorage.removeItem(TRIP_STORAGE_KEY);
    setTripError(null);
    setRestoreError(null);
    navigate("/");
  }

  async function deleteSavedTrip(tripId: string) {
    try {
      await api.deleteTrip(tripId);
      setSavedTrips((items) => items.filter((item) => item.trip_id !== tripId));
      if (trip?.trip_id === tripId) startNewTrip();
    } catch (cause) { setRestoreError(cause instanceof Error ? cause.message : "Could not delete this saved trip."); }
  }

  async function topUpWallet(event: FormEvent) {
    event.preventDefault();
    const amount = Number(topUp);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) { setWalletError("Enter a whole rupee amount from ₹1 to ₹1,000,000."); return; }
    setTopUpBusy(true); setWalletError(null);
    try { const result = await api.topUp(amount * 100, crypto.randomUUID()); setWallet(result.wallet); }
    catch (cause) { setWalletError(cause instanceof Error ? cause.message : "Wallet top-up failed."); }
    finally { setTopUpBusy(false); }
  }

  async function handleSelection(type: "hotel" | "cab" | "flight", option: TravelOption) {
    if (!trip || tripBusy || replanBusy) return;
    if (type === "flight") {
      const flight = option;
      const activities = trip.itinerary_items || [];
      const flightKey = `${flight.airline || "Flight"} ${flight.flight_number || ""}`.trim();
      const updated: Activity[] = activities.filter((item) => !item.is_flight_entry);
      updated.unshift({ date: trip.request.start_date, start_time: flight.departure || "", end_time: flight.arrival || "",
        title: `Flight schedule: ${flightKey}`, location: `${trip.request.origin} → ${trip.selected_destination || trip.request.destination || ""}`,
        description: "Schedule selected from research results. This API does not provide a fare or issue a ticket.",
        status: "SCHEDULE_ONLY", reason: "Traveler selected a researched schedule", is_flight_entry: true });
      try {
        const persisted = await api.updateTripItinerary(trip.trip_id, updated, "Traveler selected a researched flight schedule");
        setTrip(persisted.trip);
        api.savedTrips().then(({ trips }) => setSavedTrips(trips)).catch(() => undefined);
      } catch (cause) { setPaymentError(cause instanceof Error ? cause.message : "Could not save the selected flight schedule."); }
      return;
    }
    const name = option.name || "Selected service";
    const key = `${type}:${name}`;
    if (paymentBusy || trip.sandbox_bookings?.some((booking) => booking.success && booking.payment?.items?.some((item) => item.category === type && item.name === name))) return;
    setPaymentBusy(key); setPaymentError(null);
    const checkout = window.open("about:blank", "tripmate-agent-checkout", "width=760,height=850");
    renderSandboxCheckout(checkout, { name, amount: currency(option.quote?.amount_minor), state: "processing" });
    const controller = new AbortController(); selectionController.current = controller;
    try {
      const response = await api.select(trip.trip_id, type, option, { ...trip.request, destination: trip.selected_destination }, controller.signal);
      if (type === "cab" || type === "hotel") {
        const booking = response.sandbox_booking;
        if (!booking) throw new Error("The backend returned no booking record; nothing will be shown as paid.");
        if (!booking.success || booking.payment?.status !== "SUCCESS" || booking.payment.booking_status !== "CONFIRMED") {
          throw new Error(booking.error || "The backend did not confirm this sandbox payment.");
        }
        const payment = booking.payment;
        const item = payment.items?.find((row) => row.category === type);
        const amount = (item?.amount_minor ?? payment.amount_minor ?? 0) / 100;
        let itinerary = [...(trip.itinerary_items || [])];
        if (type === "hotel") {
          itinerary = itinerary.filter((activity) => !activity.is_hotel_entry);
          itinerary.push({ date: option.quote?.check_in || trip.request.start_date, start_time: "14:00", end_time: "15:00",
            title: `Sandbox stay confirmed: ${name}`, location: option.area || trip.selected_destination || "",
            description: `${option.quote?.nights ?? ""} night(s), ${option.quote?.rooms ?? ""} room(s). No supplier reservation was placed.`,
            status: "SANDBOX_CONFIRMED", cost: amount, reason: "Backend payment and booking confirmation", is_hotel_entry: true, booking_id: booking.booking_id });
        } else {
          itinerary = itinerary.filter((activity) => !activity.is_cab_entry);
          itinerary.push({ date: option.quote?.travel_date || trip.request.start_date, start_time: "12:00", end_time: "13:00",
            title: `Sandbox transfer confirmed: ${name}`, location: option.route || trip.selected_destination || "",
            description: `${option.vehicle || "Local transfer"}. No transport supplier was reserved.`, status: "SANDBOX_CONFIRMED",
            cost: amount, reason: "Backend payment and booking confirmation", is_cab_entry: true, booking_id: booking.booking_id });
        }
        setTrip(response.trip ? { ...response.trip, sandbox_bookings: response.trip.sandbox_bookings || [...(trip.sandbox_bookings || []), booking] } : { ...trip, itinerary_items: itinerary, sandbox_bookings: [...(trip.sandbox_bookings || []), booking] });
        api.savedTrips().then(({ trips }) => setSavedTrips(trips)).catch(() => undefined);
        renderSandboxCheckout(checkout, { name, amount: currency(payment.amount_minor), state: "success", booking: booking as unknown as Record<string, unknown> });
        await refreshWallet();
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The selection request failed.";
      setPaymentError(message);
      renderSandboxCheckout(checkout, { name, amount: currency(option.quote?.amount_minor), state: "failed", message });
    } finally { setPaymentBusy(null); selectionController.current = null; }
  }

  async function refreshPayment(paymentId: string) {
    try {
      const payment = await api.payment(paymentId);
      setTrip((current) => current ? { ...current, sandbox_bookings: (current.sandbox_bookings || []).map((booking) =>
        (booking.payment?.payment_id || booking.payment_id) === paymentId ? {
          ...booking,
          success: payment.status === "SUCCESS" && payment.booking_status === "CONFIRMED",
          status: payment.status,
          booking_status: payment.booking_status,
          amount_minor: payment.amount_minor,
          payment,
        } : booking) } : current);
      setPaymentError(null);
    } catch (cause) { setPaymentError(cause instanceof Error ? cause.message : "Could not fetch payment status."); }
  }

  async function replan(changeText: string): Promise<boolean> {
    if (!trip || paymentBusy || tripBusy) return false;
    const number = ++replanSequence.current;
    setReplanBusy(true); setReplanError(null); setReplanProgress("The replanning agent is processing your change. The current itinerary stays visible until a response arrives.");
    const activities = trip.itinerary_items || [];
    try {
      const result = await api.replan({ trip_id: trip.trip_id, change_text: changeText,
        expected_version: trip.current_version,
        itinerary: activities.filter((activity) => !activity.is_flight_entry && !activity.is_hotel_entry && !activity.is_cab_entry).map((activity) => ({
          date: activity.date, start_time: activity.start_time, end_time: activity.end_time || "Flexible", title: activity.title,
          location: activity.location, description: activity.description, estimated_cost: activity.cost ?? activity.estimated_cost,
          cost_status: activity.status || activity.cost_status || "ESTIMATED", reason: activity.reason || activity.description,
        })),
        trip_context: { destination: trip.selected_destination || trip.request.destination, origin: trip.request.origin,
          pace: trip.request.pace, start_date: trip.request.start_date, end_date: trip.request.end_date, travelers: trip.request.travelers,
          budget: trip.request.budget, accommodation: trip.request.accommodation } });
      if (number !== replanSequence.current) return false;
      if (!Array.isArray(result.itinerary)) throw new Error("The replanning endpoint returned no itinerary array. The current plan was kept.");
      const backendActivities = result.itinerary.map((activity) => ({ ...activity,
        date: activity.date || trip.request.start_date,
        status: activity.cost_status || "PLANNED",
        cost: activity.estimated_cost == null ? null : Number(activity.estimated_cost),
      }));
      const preserved = activities.filter((activity) => activity.is_flight_entry || activity.is_hotel_entry || activity.is_cab_entry);
      const hotels = result.hotel_search_performed ? (result.updated_hotels || []) : trip.hotels;
      const updatedTrip = result.trip || { ...trip, itinerary_items: [...preserved, ...backendActivities], hotels };
      setTrip(updatedTrip);
      api.tripMessages(trip.trip_id).then(({ messages }) => setConversation(messages as TripMessage[])).catch(() => undefined);
      api.savedTrips().then(({ trips }) => setSavedTrips(trips)).catch(() => undefined);
      setReplanError(null);
      return true;
    } catch (cause) { setReplanError(cause instanceof Error ? cause.message : "The itinerary could not be updated."); return false; }
    finally { if (number === replanSequence.current) { setReplanBusy(false); setReplanProgress(null); } }
  }

  async function legacyRequest(event: FormEvent) {
    event.preventDefault(); if (!legacyMessage.trim() || legacyBusy) return;
    setLegacyBusy(true); setLegacyError(null);
    try {
      const result = await api.legacyTravel(legacyMessage.trim(), legacyThreadId);
      setLegacyAnswer(result.answer || "The backend returned no text answer.");
      if (result.thread_id) setLegacyThreadId(result.thread_id);
      setLegacyMessage("");
    } catch (cause) { setLegacyError(cause instanceof Error ? cause.message : "The natural-language endpoint failed."); }
    finally { setLegacyBusy(false); }
  }

  if (isDiscovery) return <DiscoveryPage onPlan={handleHandoff} />;

  return <>
    <div className="page-bg" aria-hidden="true"><div className="gradient-circle circle-1" /><div className="gradient-circle circle-2" /><div className="gradient-circle circle-3" /></div>
    <main className="app-container">
      <nav className="trip-navigation" aria-label="Trip navigation">
        <button type="button" onClick={startNewTrip}>＋ New trip</button>
        <button type="button" onClick={openDiscovery}>Discover destinations</button>
        <details><summary>Saved trips ({savedTrips.length})</summary>
          {savedTrips.length ? <ul>{savedTrips.map((item) => <li key={item.trip_id}>
            <button type="button" onClick={() => void openSavedTrip(item.trip_id)}>{item.name} · v{item.current_version}</button>
            <small>{item.destination || "Destination pending"} · {new Date(item.updated_at).toLocaleString()}</small>
            <button type="button" aria-label={`Rename ${item.name}`} onClick={async () => { const name = window.prompt("Trip name", item.name); if (!name?.trim()) return; try { const result = await api.renameTrip(item.trip_id, name); const savedName = typeof result.trip.name === "string" ? result.trip.name : name; setSavedTrips((rows) => rows.map((row) => row.trip_id === item.trip_id ? { ...row, name: savedName } : row)); if (trip?.trip_id === item.trip_id) setTrip(result.trip); } catch (cause) { setRestoreError(cause instanceof Error ? cause.message : "Could not rename trip."); } }}>Rename</button>
            <button type="button" onClick={() => void deleteSavedTrip(item.trip_id)}>Delete</button>
          </li>)}</ul> : <p>No saved trips yet.</p>}
        </details>
      </nav>
      {restoreError && <div className="error" role="alert">{restoreError}</div>}
      <PlannerForm onSubmit={createTrip} onOpenDiscovery={openDiscovery} busy={tripBusy || paymentBusy !== null || replanBusy} error={tripError} initial={handoff} />
      <section className="wallet-panel"><div><strong>Agent sandbox wallet:</strong> <span>{wallet ? currency(wallet.available_minor) : walletError ? "Unavailable" : "Loading…"}</span>{wallet && <small> · {currency(wallet.reserved_minor)} reserved · {wallet.currency}</small>}</div><form onSubmit={topUpWallet}><label htmlFor="topup-amount">Add sandbox funds (₹)</label><input id="topup-amount" type="number" min="1" max="1000000" step="1" value={topUp} onChange={(event) => setTopUp(event.target.value)} /><button className="secondary-btn" type="submit" disabled={topUpBusy}>{topUpBusy ? "Adding funds…" : "Add sandbox funds"}</button></form>{walletError && <p className="error" role="alert">{walletError}</p>}<small>Simulated wallet funds only. No real payment is collected.</small></section>
      {tripProgress && <section className="result-section" aria-live="polite"><h2>Planning trip</h2><p className="progress-active"><span className="loader" /> {tripProgress}</p><button type="button" className="cancel-btn" onClick={() => tripController.current?.abort()}>Pause research</button></section>}
      {paymentError && <div className="error" role="alert">{paymentError}</div>}
      {paymentBusy && <section className="payment-agent-panel" aria-live="polite"><div className="step-label">TripMate · Sandbox checkout</div><h2>Payment agent is processing your selection</h2><p>{paymentBusy.replace(":", " · ")} · validating quote, wallet, payment policy, and booking response.</p></section>}
      {trip && <TripResults trip={trip} conversation={conversation} onSelect={handleSelection} bookingBusy={paymentBusy || (tripBusy || replanBusy ? "trip-update" : null)} paymentStatus={refreshPayment} onReplan={replan} replanBusy={replanBusy} replanError={replanError} />}
      {replanProgress && <div className="agent-progress" aria-live="polite"><span className="loader" /> {replanProgress}</div>}
      <details className="api-diagnostics"><summary>Backend readiness and endpoint status</summary>{diagnosticsError && <p className="error">{diagnosticsError}</p>}{diagnostics ? <pre>{JSON.stringify(diagnostics, null, 2)}</pre> : <p>Checking backend diagnostics…</p>}</details>
      <details className="legacy-travel-panel"><summary>Natural-language endpoint (current backend capability)</summary><p>The existing `/api/travel` route returns its actual backend response. It is not a full persistent chat workflow in the current backend; use “Adjust itinerary” for itinerary changes.</p><form onSubmit={legacyRequest}><label htmlFor="legacy-message">Request</label><textarea id="legacy-message" required value={legacyMessage} onChange={(event) => setLegacyMessage(event.target.value)} placeholder="Enter a natural-language travel request" /><button className="secondary-btn" type="submit" disabled={legacyBusy}>{legacyBusy ? "Sending request…" : "Send to existing travel endpoint"}</button><button type="button" onClick={() => { setLegacyThreadId(undefined); setLegacyAnswer(null); }}>Start new request</button></form>{legacyError && <p className="error" role="alert">{legacyError}</p>}{legacyAnswer && <article className="agent-answer"><h3>Backend response</h3><p>{legacyAnswer}</p></article>}</details>
      <footer>Gemini · LangGraph multi-agent planning · sandbox-only bookings</footer>
    </main>
  </>;
}

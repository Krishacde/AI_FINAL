import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import { DiscoveryPage } from "./DiscoveryPage";
import { PlannerForm, type Handoff } from "./PlannerForm";
import { TripResults } from "./TripResults";
import type { Trip, TripMessage, TripRequest, TravelOption, Wallet } from "./types";
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

function itineraryOption(type: "hotel" | "cab" | "flight" | "train", option: TravelOption, trip: Trip) {
  const name = option.name || option.airline || option.flight_number || option.train_name || option.train_number || "Selected service";
  const quote = option.quote;
  const isTrain = type === "train";
  return {
    date: quote?.travel_date || option.travel_date || quote?.check_in || trip.request.start_date,
    start_time: isTrain ? option.departure_time || "" : option.departure || "",
    end_time: isTrain ? option.arrival_time || "" : option.arrival || "",
    title: name,
    location: option.route || option.area || `${option.departure_station || trip.request.origin} → ${option.arrival_station || trip.selected_destination || trip.request.destination || ""}`,
    description: "Added from TripMate options. Continue to payment when you’re ready.",
    reason: "Selected travel option",
    cost: quote?.amount_minor != null ? quote.amount_minor / 100 : option.total_num ?? option.price_num ?? null,
    status: "PLANNED",
    booking_category: type,
    booking_option: option,
    is_tripmate_option: true,
    is_hotel_entry: type === "hotel",
    is_cab_entry: type === "cab",
    is_flight_entry: type === "flight",
    is_train_entry: type === "train",
  };
}

function renderSandboxCheckout(
  popup: Window | null,
  details: { name: string; amount: string; state: "processing" | "success" | "failed"; booking?: Record<string, unknown>; message?: string },
) {
  if (!popup) return;
  const previousTimer = (popup as Window & { __tripmateTimer?: number }).__tripmateTimer;
  if (previousTimer) window.clearInterval(previousTimer);
  if (popup.closed) return;
  const document = popup.document;
  document.head.innerHTML = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;padding:24px;display:grid;place-items:center;color:#edf5ff;background:radial-gradient(ellipse at 15% 0%,#174252 0,transparent 44%),linear-gradient(145deg,#081321,#10213a);font:15px Inter,system-ui,Segoe UI,sans-serif}.shell{width:min(490px,100%);padding:clamp(22px,6vw,34px);border:1px solid #ffffff20;border-radius:25px;background:#0e2037ef;box-shadow:0 28px 90px #0008;animation:rise .35s ease both}.brand{display:flex;align-items:center;gap:10px;color:#aaf2df;font-size:12px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}.mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid #79e4d044;border-radius:11px;background:#79e4d012;font-size:18px}.hero{display:grid;place-items:center;margin:30px 0 22px}.orb{position:relative;display:grid;place-items:center;width:104px;height:104px;border:1px solid #79e4d044;border-radius:50%;background:radial-gradient(circle,#79e4d01c,transparent 68%);box-shadow:0 0 42px #79e4d018}.orb:before,.orb:after{position:absolute;inset:8px;border:1px solid #79e4d033;border-radius:50%;content:"";animation:pulse 2.4s ease-out infinite}.orb:after{animation-delay:1.2s}.orb-icon{font-size:30px;color:#aaf2df}.spinner{position:absolute;inset:-5px;border:2px solid transparent;border-top-color:#91f0d8;border-right-color:#91f0d866;border-radius:50%;animation:spin 1.1s linear infinite}h1{margin:0;text-align:center;font-size:clamp(25px,7vw,32px);letter-spacing:-.045em}.muted{margin:8px 0 0;text-align:center;color:#a8bad1;line-height:1.55}.summary{display:flex;justify-content:space-between;gap:18px;margin:24px 0;padding:16px;border:1px solid #ffffff18;border-radius:16px;background:#ffffff06}.summary small{display:block;color:#95aac3}.summary strong{display:block;margin-top:5px}.amount{color:#aaf2df;font-size:22px;white-space:nowrap}.status{display:flex;justify-content:center;gap:8px;align-items:center;color:#b9f5e6;font-size:13px;font-weight:750}.bar{height:5px;margin:16px 0 19px;overflow:hidden;border-radius:99px;background:#ffffff12}.bar span{display:block;width:35%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#69d8c5,#b6f4df);animation:progress 2.8s ease-in-out infinite}.steps{display:grid;gap:11px;margin:18px 0 4px;padding:0;list-style:none}.steps li{display:flex;gap:10px;align-items:center;color:#8fa5be;font-size:13px;transition:color .25s}.steps li:before{content:"";width:19px;height:19px;border:1px solid #ffffff25;border-radius:50%;background:#ffffff08}.steps li.active{color:#e6f7f2}.steps li.active:before{border-color:#91f0d8;background:#91f0d8;box-shadow:0 0 14px #91f0d866}.steps li.done{color:#b9f5e6}.steps li.done:before{content:"✓";display:grid;place-items:center;border-color:#79e4d044;background:#79e4d022;font-size:12px}.pill{display:inline-flex;gap:8px;align-items:center;padding:8px 11px;border:1px solid #79e4d033;border-radius:99px;color:#b9f5e6;background:#79e4d00b;font-size:12px;font-weight:750}.result{margin-top:18px;padding:14px;border:1px solid #79e4d033;border-radius:14px;color:#baf3e5;background:#79e4d00c;text-align:center;line-height:1.55}.result.error{border-color:#fb718533;color:#fecaca;background:#fb71830c}.actions{display:flex;justify-content:center;margin-top:20px}.actions button{min-height:45px;padding:10px 18px;border:0;border-radius:12px;color:#08251f;background:linear-gradient(115deg,#91f0d8,#69d8c5);font:inherit;font-weight:800;cursor:pointer}.actions button:hover{filter:brightness(1.06);transform:translateY(-1px)}.foot{margin-top:21px;padding-top:15px;border-top:1px solid #ffffff14;color:#8398b1;font-size:11px;line-height:1.5;text-align:center}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%{transform:scale(.82);opacity:.6}100%{transform:scale(1.28);opacity:0}}@keyframes progress{0%{transform:translateX(-110%)}100%{transform:translateX(340%)}}@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important}}
  </style>`;
  document.title = "TripMate · Secure checkout";
  document.body.innerHTML = `<main class="shell"><div class="brand"><span class="mark">✦</span>TripMate checkout</div><div class="hero"><div class="orb"><span class="spinner" id="spinner"></span><span class="orb-icon" id="orb-icon">✦</span></div></div><h1 id="title"></h1><p id="description" class="muted"></p><section class="summary"><div><small>Selected service</small><strong id="service"></strong><small id="reference"></small></div><strong id="amount" class="amount"></strong></section><div id="status" class="status"></div><div class="bar" id="bar"><span></span></div><ol id="steps" class="steps"><li>Checking your selection</li><li>Confirming your booking</li><li>Finishing secure checkout</li></ol><div id="result"></div><div class="actions"><button id="return" type="button">Return to trip</button></div><p class="foot">Sandbox checkout · no real payment is collected.</p></main>`;
  document.querySelector<HTMLButtonElement>("#return")?.addEventListener("click", () => popup.close());
  document.querySelector("#service")!.textContent = details.name;
  document.querySelector("#amount")!.textContent = details.amount;
  const title = document.querySelector("#title")!;
  const description = document.querySelector("#description")!;
  const status = document.querySelector("#status")!;
  const spinner = document.querySelector<HTMLElement>("#spinner")!;
  const orbIcon = document.querySelector<HTMLElement>("#orb-icon")!;
  const bar = document.querySelector<HTMLElement>("#bar")!;
  const steps = [...document.querySelectorAll<HTMLElement>("#steps li")];
  const result = document.querySelector<HTMLElement>("#result")!;
  if (details.state === "processing") {
    title.textContent = "Getting everything ready";
    description.textContent = "We’re confirming your selection and preparing your trip.";
    status.innerHTML = '<span class="spinner"></span> Secure checkout in progress';
    let active = 0;
    const update = () => steps.forEach((step, index) => step.classList.toggle(index < active ? "done" : "active", index <= active));
    update();
    (popup as Window & { __tripmateTimer?: number }).__tripmateTimer = window.setInterval(() => { active = Math.min(active + 1, steps.length - 1); update(); }, 1150);
    document.querySelector<HTMLButtonElement>("#return")!.textContent = "Return to trip";
    document.querySelector<HTMLButtonElement>("#return")!.disabled = true;
  } else if (details.state === "success") {
    title.textContent = "You’re all set";
    description.textContent = "Your booking is confirmed and added to your itinerary.";
    status.innerHTML = '<span class="pill">✓ Payment confirmed</span>';
    spinner.hidden = true; orbIcon.textContent = "✓"; bar.hidden = true;
    steps.forEach((step) => step.classList.add("done"));
    document.querySelector("#reference")!.textContent = `Booking · ${String(details.booking?.booking_id || "Confirmed")}`;
    result.className = "result"; result.textContent = "Your booking details are ready in the trip plan.";
    document.querySelector<HTMLButtonElement>("#return")!.disabled = false;
  } else {
    title.textContent = "Checkout couldn’t finish";
    description.textContent = "No confirmed booking was added. Your itinerary is still saved.";
    status.innerHTML = '<span class="pill">Checkout not completed</span>';
    spinner.hidden = true; orbIcon.textContent = "!"; bar.hidden = true;
    document.querySelector<HTMLOListElement>("#steps")!.hidden = true;
    result.className = "result error"; result.textContent = "Please try again from your trip. No confirmed payment was recorded.";
    document.querySelector<HTMLButtonElement>("#return")!.disabled = false;
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
  const [itineraryBusy, setItineraryBusy] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [replanBusy, setReplanBusy] = useState(false);
  const [replanError, setReplanError] = useState<string | null>(null);
  const [replanProgress, setReplanProgress] = useState<string | null>(null);
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
    setTripBusy(true); setTripError(null); setTripProgress("Putting together your day-by-day trip plan…");
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
      if (cause instanceof DOMException && cause.name === "AbortError") setTripError("Trip planning was paused. Your form entries are still available.");
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

  async function addToItinerary(type: "hotel" | "cab" | "flight" | "train", option: TravelOption) {
    if (!trip || paymentBusy || itineraryBusy || tripBusy || replanBusy) return;
    const pending = itineraryOption(type, option, trip);
    const current = trip.itinerary_items || [];
    if (current.some((activity) => activity.booking_category === type && activity.title === pending.title)) return;
    setItineraryBusy(true); setPaymentError(null);
    try {
      const response = await api.updateTripItinerary(trip.trip_id, [...current, pending], `Added ${pending.title} to the itinerary`);
      const fresh = response.trip;
      setTrip({ ...fresh, itinerary_items: (fresh.itinerary_items || []).map((activity) => ({
        ...activity, recently_changed: activity.title === pending.title && activity.booking_category === type,
      })) });
      window.setTimeout(() => setTrip((value) => value?.trip_id === trip.trip_id ? { ...value, itinerary_items: (value.itinerary_items || []).map((activity) => ({ ...activity, recently_changed: false })) } : value), 4500);
    } catch {
      setPaymentError("We couldn’t save that option to your itinerary. Please try again.");
    } finally { setItineraryBusy(false); }
  }

  async function handleSelection(type: "hotel" | "cab" | "flight" | "train", option: TravelOption) {
    if (!trip || tripBusy || replanBusy || paymentBusy) return;
  const name = option.name || option.airline || option.flight_number || option.train_name || option.train_number || "Selected service";
    const key = `${type}:${name}`;
    if (paymentBusy || trip.sandbox_bookings?.some((booking) => booking.success && booking.payment?.items?.some((item) => item.category === type && item.name === name))) return;
    setPaymentBusy(key); setPaymentError(null);
    const checkout = window.open("about:blank", "tripmate-agent-checkout", "width=760,height=850");
    renderSandboxCheckout(checkout, { name, amount: currency(option.quote?.amount_minor), state: "processing" });
    const controller = new AbortController(); selectionController.current = controller;
    try {
      const response = await api.select(trip.trip_id, type, option, { ...trip.request, destination: trip.selected_destination }, controller.signal);
      {
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
            title: name, location: option.area || trip.selected_destination || "",
            description: `${option.quote?.nights ?? ""} night(s), ${option.quote?.rooms ?? ""} room(s). Booking confirmed.`,
            status: "SANDBOX_CONFIRMED", cost: amount, reason: "Backend payment and booking confirmation", is_hotel_entry: true, booking_id: booking.booking_id });
        } else if (type === "cab") {
          itinerary = itinerary.filter((activity) => !activity.is_cab_entry);
          itinerary.push({ date: option.quote?.travel_date || trip.request.start_date, start_time: "12:00", end_time: "13:00",
            title: name, location: option.route || trip.selected_destination || "",
            description: `${option.vehicle || "Local transfer"}. Booking confirmed.`, status: "SANDBOX_CONFIRMED",
            cost: amount, reason: "Backend payment and booking confirmation", is_cab_entry: true, booking_id: booking.booking_id });
        } else {
          const isTrain = type === "train";
          const time = isTrain ? option.departure_time : option.departure;
          const end = isTrain ? option.arrival_time : option.arrival;
          itinerary = itinerary.filter((activity) => isTrain ? !activity.is_train_entry : !activity.is_flight_entry);
          itinerary.push({ date: option.quote?.travel_date || trip.request.start_date, start_time: String(time || ""), end_time: String(end || ""),
            title: `${name}${option.flight_number ? ` (${option.flight_number})` : option.train_number ? ` (${option.train_number})` : ""}`,
            location: option.route || `${option.departure_station || trip.request.origin} → ${option.arrival_station || trip.selected_destination || trip.request.destination || ""}`,
            description: "Booking confirmed.", status: "SANDBOX_CONFIRMED", cost: amount,
            reason: "Backend payment and booking confirmation", is_train_entry: isTrain, is_flight_entry: !isTrain, booking_id: booking.booking_id });
        }
        const savedTrip = response.trip || { ...trip, itinerary_items: itinerary, sandbox_bookings: [...(trip.sandbox_bookings || []), booking] };
        const updatedTrip = { ...savedTrip, itinerary_items: (savedTrip.itinerary_items || itinerary).map((activity) => ({ ...activity, recently_changed: activity.booking_id === booking.booking_id })) };
        setTrip(updatedTrip);
        window.setTimeout(() => setTrip((current) => current?.trip_id === trip.trip_id ? { ...current, itinerary_items: (current.itinerary_items || []).map((activity) => ({ ...activity, recently_changed: false })) } : current), 6500);
        api.savedTrips().then(({ trips }) => setSavedTrips(trips)).catch(() => undefined);
        renderSandboxCheckout(checkout, { name, amount: currency(payment.amount_minor), state: "success", booking: booking as unknown as Record<string, unknown> });
        await refreshWallet();
      }
    } catch (cause) {
      const message = "Payment couldn’t be completed. No confirmed booking was added.";
      setPaymentError(message);
      renderSandboxCheckout(checkout, { name, amount: currency(option.quote?.amount_minor), state: "failed", message });
    } finally { setPaymentBusy(null); selectionController.current = null; }
  }

  async function replan(changeText: string): Promise<boolean> {
    if (!trip || paymentBusy || tripBusy) return false;
    const number = ++replanSequence.current;
    setReplanBusy(true); setReplanError(null); setReplanProgress("The replanning agent is processing your change. The current itinerary stays visible until a response arrives.");
    const activities = trip.itinerary_items || [];
    try {
      const result = await api.replan({ trip_id: trip.trip_id, change_text: changeText,
        expected_version: trip.current_version,
        itinerary: activities.filter((activity) => !activity.is_flight_entry && !activity.is_train_entry && !activity.is_hotel_entry && !activity.is_cab_entry).map((activity) => ({
          date: activity.date, start_time: activity.start_time, end_time: activity.end_time || "Flexible", title: activity.title,
          location: activity.location, description: activity.description, estimated_cost: activity.cost ?? activity.estimated_cost,
          cost_status: activity.status || activity.cost_status || "ESTIMATED", reason: activity.reason || activity.description,
        })),
        trip_context: { destination: trip.selected_destination || trip.request.destination, origin: trip.request.origin,
          pace: trip.request.pace, start_date: trip.request.start_date, end_date: trip.request.end_date, travelers: trip.request.travelers,
          budget: trip.request.budget, accommodation: trip.request.accommodation } });
      if (number !== replanSequence.current) return false;
      if (!Array.isArray(result.itinerary)) throw new Error("The replanning endpoint returned no itinerary array. The current plan was kept.");
      const oldActivities = new Set(activities.map((activity) => `${activity.date || ""}|${activity.title || ""}`));
      const backendActivities = result.itinerary.map((activity) => ({ ...activity,
        date: activity.date || trip.request.start_date,
        status: activity.cost_status || "PLANNED",
        cost: activity.estimated_cost == null ? null : Number(activity.estimated_cost),
        recently_changed: !oldActivities.has(`${activity.date || trip.request.start_date}|${activity.title || ""}`),
      }));
      const preserved = activities.filter((activity) => activity.is_flight_entry || activity.is_train_entry || activity.is_hotel_entry || activity.is_cab_entry);
      const hotels = result.hotel_search_performed ? (result.updated_hotels || []) : trip.hotels;
      const changedKeys = new Set(backendActivities.filter((activity) => activity.recently_changed).map((activity) => `${activity.date}|${activity.title}`));
      const updatedTrip = result.trip ? { ...result.trip, itinerary_items: (result.trip.itinerary_items || result.trip.itinerary || []).map((activity) => ({
        ...activity, recently_changed: changedKeys.has(`${activity.date || trip.request.start_date}|${activity.title || ""}`),
      })) } : { ...trip, itinerary_items: [...preserved, ...backendActivities], hotels };
      setTrip(updatedTrip);
      window.setTimeout(() => setTrip((current) => current?.trip_id === trip.trip_id ? { ...current, itinerary_items: (current.itinerary_items || []).map((activity) => ({ ...activity, recently_changed: false })) } : current), 6500);
      const now = new Date().toISOString();
      const summary = result.change_summary || "Your itinerary has been updated.";
      setConversation((current) => [...current,
        { role: "user", content: changeText, created_at: now },
        { role: "assistant", content: summary, created_at: now },
      ]);
      // React state is updated from the saved backend response above; bring the
      // refreshed plan into view so the traveler sees the change immediately.
      window.requestAnimationFrame(() => {
        const plan = document.getElementById("itinerarySection");
        plan?.scrollIntoView({ behavior: "smooth", block: "start" });
        plan?.classList.add("itinerary-refresh-highlight");
        window.setTimeout(() => plan?.classList.remove("itinerary-refresh-highlight"), 1800);
      });
      api.tripMessages(trip.trip_id).then(({ messages }) => setConversation(messages as TripMessage[])).catch(() => undefined);
      api.savedTrips().then(({ trips }) => setSavedTrips(trips)).catch(() => undefined);
      setReplanError(null);
      return true;
    } catch (cause) { setReplanError(cause instanceof Error ? cause.message : "The itinerary could not be updated."); return false; }
    finally { if (number === replanSequence.current) { setReplanBusy(false); setReplanProgress(null); } }
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
      <PlannerForm onSubmit={createTrip} onOpenDiscovery={openDiscovery} busy={tripBusy || paymentBusy !== null || itineraryBusy || replanBusy} error={tripError} initial={handoff} />
      <section className="wallet-panel"><div><strong>TripMate sandbox balance</strong><span>{wallet ? currency(wallet.available_minor) : walletError ? "Unavailable" : "Loading…"}</span></div><form onSubmit={topUpWallet}><label htmlFor="topup-amount">Add demo funds (₹)</label><input id="topup-amount" type="number" min="1" max="1000000" step="1" value={topUp} onChange={(event) => setTopUp(event.target.value)} /><button className="secondary-btn" type="submit" disabled={topUpBusy}>{topUpBusy ? "Adding…" : "Add funds"}</button></form>{walletError && <p className="error" role="alert">{walletError}</p>}<small>Demo balance only. No real payment is collected.</small></section>
      {tripProgress && <section className="result-section" aria-live="polite"><h2>Planning your trip</h2><p className="progress-active"><span className="loader" /> {tripProgress}</p><button type="button" className="cancel-btn" onClick={() => tripController.current?.abort()}>Pause planning</button></section>}
      {paymentError && <div className="error" role="alert">{paymentError}</div>}
      {paymentBusy && <div className="checkout-inline-status" role="status"><span className="checkout-inline-spinner" /> Completing your booking…</div>}
      {trip && <TripResults trip={trip} conversation={conversation} onSelect={handleSelection} onAddToItinerary={addToItinerary} bookingBusy={paymentBusy || (tripBusy || replanBusy || itineraryBusy ? "trip-update" : null)} onReplan={replan} replanBusy={replanBusy} replanError={replanError} replanProgress={replanProgress} />}
      <footer>Gemini · LangGraph multi-agent planning · sandbox-only bookings</footer>
    </main>
  </>;
}

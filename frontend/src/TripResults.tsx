import { useState, type ReactNode } from "react";
import type { Activity, BookingResult, Payment, Trip, TripMessage, TravelOption } from "./types";

type Props = {
  trip: Trip;
  conversation: TripMessage[];
  onSelect: (type: "hotel" | "cab" | "flight" | "train", option: TravelOption) => void;
  onAddToItinerary: (type: "hotel" | "cab" | "flight" | "train", option: TravelOption) => void;
  bookingBusy: string | null;
  onReplan: (text: string) => Promise<boolean>;
  replanBusy: boolean;
  replanError: string | null;
  replanProgress: string | null;
};

const money = (value?: number | null) => value == null || !Number.isFinite(Number(value)) ? "Not returned" : `₹${Number(value).toLocaleString("en-IN")}`;
function SafeLink({ href, children }: { href?: string | null; children: ReactNode }) {
  if (!href) return null;
  try { const url = new URL(href); if (!(["https:", "http:"].includes(url.protocol))) return null; return <a href={url.href} target="_blank" rel="noreferrer">{children}</a>; } catch { return null; }
}

function ActivityTimeline({ items, onPay, busy }: { items: Activity[]; onPay: Props["onSelect"]; busy: string | null }) {
  if (!items.length) return <div className="empty-notice">The planning service returned no itinerary activities.</div>;
  const groups = new Map<string, Activity[]>();
  items.forEach((activity) => { const key = activity.date || "Date not returned"; groups.set(key, [...(groups.get(key) || []), activity]); });
  return <div className="itinerary-timeline">{Array.from(groups.entries()).map(([date, activities], index) => <section className="itinerary-day-block" key={date}>
    <div className="day-badge-header"><span className="day-number">Day {index + 1}</span><span className="day-date">{date}</span></div>
    <div className="day-activities">{activities.map((act, activityIndex) => { const option = act.booking_option as TravelOption | undefined; const category = act.booking_category as "hotel" | "cab" | "flight" | "train" | undefined; return <article className={`activity-card ${act.recently_changed ? "activity-card--changed" : ""}`} key={`${act.title}-${activityIndex}`}>
      <div className="activity-time">{act.start_time || "Time not returned"}{act.end_time ? ` – ${act.end_time}` : ""}</div>
      <div className="activity-content"><h4>{act.title || "Untitled activity"}</h4><p className="activity-location">📍 {act.location || "Location not returned"}</p>{act.description && <p>{act.description}</p>}</div>
      <div className="activity-meta"><span className="status-badge">{act.booking_id || act.status === "SANDBOX_CONFIRMED" ? "Booked" : "Planned"}</span><span>{money(act.cost ?? act.estimated_cost)}</span>{option && category && !act.booking_id && <button className="itinerary-pay-btn" type="button" disabled={Boolean(busy)} onClick={() => onPay(category, option)}>{busy === `${category}:${option.name || option.airline || option.flight_number || option.train_name || option.train_number || "Selected service"}` ? "Opening checkout…" : "Proceed to payment"}</button>}</div>
    </article>; })}</div>
  </section>)}</div>;
}

function BookingDocumentWindow({ payment }: { payment: Payment }) {
  const docs = payment.documents || {};
  const printable = () => {
    const popup = window.open("", "tripmate-booking-document", "width=800,height=900");
    if (!popup) return;
    const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
    const entries = Object.entries(docs).filter(([key]) => key !== "label").map(([name, document]) => {
      const rows = Object.entries(document).filter(([key, value]) => key !== "label" && value !== null && typeof value !== "object").map(([key, value]) => `<tr><th>${esc(key.replaceAll("_", " "))}</th><td>${esc(key === "amount_minor" ? money(Number(value) / 100) : value)}</td></tr>`).join("");
      return `<section><h2>${esc(name.replaceAll("_", " "))}</h2><table>${rows}</table></section>`;
    }).join("");
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>TripMate booking documents</title><style>body{font:15px Arial;max-width:760px;margin:32px auto;padding:16px;color:#172033}header{border-bottom:2px solid #64748b}h2{text-transform:capitalize;margin-top:28px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #cbd5e1}th{text-transform:capitalize;width:36%}.label{color:#b91c1c;font-weight:bold}@media print{button{display:none}}</style></head><body><header><h1>TripMate booking documents</h1><p class="label">${esc(docs.label || "SANDBOX / SIMULATED BOOKING")}</p><p>These documents reflect backend-returned sandbox records only.</p></header>${entries}<button onclick="window.print()">Print / Save as PDF</button></body></html>`);
    popup.document.close();
  };
  return <button type="button" className="secondary-btn" onClick={printable}>Open booking documents · Print / Save as PDF</button>;
}

function BookingCard({ booking }: { booking: BookingResult }) {
  const payment = booking.payment;
  const docs = payment?.documents;
  return <article className="data-card booking-record">
    <div className="card-header-row"><div><h3>{booking.success ? "Booking confirmed" : booking.status === "VERIFYING" ? "Checking booking" : "Booking not completed"}</h3><p>{booking.booking_id ? `Booking reference · ${booking.booking_id}` : "Your trip plan is saved"}</p></div><span className={`status-badge ${booking.success ? "VERIFIED" : "UNAVAILABLE"}`}>{booking.success ? "Confirmed" : booking.status === "VERIFYING" ? "Checking" : "Not completed"}</span></div>
    <p>{booking.success ? "Your confirmed booking is included in the itinerary." : "No confirmed booking was added."}</p>
    <dl className="booking-meta"><div><dt>Amount</dt><dd>{money((booking.amount_minor ?? payment?.amount_minor ?? 0) / 100)}</dd></div></dl>
    {docs && <BookingDocumentWindow payment={payment!} />}
  </article>;
}

function OptionCards({ kind, options, trip, bookings, busy, onSelect, onAddToItinerary }: {
  kind: "hotel" | "cab" | "flight"; options: TravelOption[]; trip: Trip; bookings: BookingResult[]; busy: string | null; onSelect: Props["onSelect"]; onAddToItinerary: Props["onAddToItinerary"];
}) {
  const title = kind === "hotel" ? "Places to stay" : kind === "cab" ? "Local rides" : "Flights";
  // FlightAgent currently returns an UNAVAILABLE record when the provider has
  // no usable schedule. Do not render that diagnostic as a fake "Option 1" card.
  const visibleOptions = kind === "flight"
    ? options.filter((option) => option.status !== "UNAVAILABLE" && Boolean(option.airline || option.flight_number || option.name))
    : options;
  const providerMessageValue = kind === "flight"
    ? options.find((option) => option.status === "UNAVAILABLE")?.error || options.find((option) => option.status === "UNAVAILABLE")?.message
    : null;
  const providerMessage = providerMessageValue == null ? "" : String(providerMessageValue);
  if (!visibleOptions.length) return <section className="dash-section"><div className="dash-section-header"><h3>{title}</h3><span className="section-tag">{kind === "flight" ? "Status data only" : "Search results"}</span></div>
    <div className={`service-empty-state ${providerMessage ? "is-unavailable" : ""}`}>
      <span className="service-empty-icon" aria-hidden="true">{providerMessage ? "!" : "↗"}</span>
      <div><h4>{providerMessage ? "Flight data is unavailable" : `No ${kind === "cab" ? "local transport quotes" : kind === "hotel" ? "accommodation options" : "flight schedules"} found`}</h4>
        <p>{kind === "flight" ? "The flight provider did not return a usable schedule for this trip. Flight schedules are informational and cannot be booked or paid for here." : `No ${kind === "cab" ? "local transport quotes" : "accommodation options"} were returned by the current backend workflow.`}</p>
      </div>
    </div></section>;
  const paid = (option: TravelOption) => bookings.some((booking) => booking.success && paymentHas(booking.payment, kind, option));
  const added = (option: TravelOption) => (trip.itinerary_items || []).some((activity) => activity.booking_category === kind && activity.title === (option.name || option.airline || option.flight_number || option.train_name || option.train_number || "Selected service"));
  return <section className="dash-section"><div className="dash-section-header"><h3>{title}</h3><span className="section-tag">{kind === "flight" ? "Simulated test price" : "Sandbox quote"}</span></div><div className="cards">{visibleOptions.map((option, index) => {
    const name = option.name || option.airline || option.flight_number || option.train_name || option.train_number || `Option ${index + 1}`;
    const quote = option.quote;
    const amount = quote?.amount_minor != null ? quote.amount_minor / 100 : option.total_num ?? option.price_num;
    const loading = busy === `${kind}:${name}`;
    const inItinerary = added(option);
    const isPaid = paid(option);
    return <article className="data-card provider-card" key={`${name}-${quote?.quote_id || index}`}>
      <div className="card-header-row"><div><h4>{kind === "hotel" ? "🏨" : kind === "cab" ? "🚗" : "✈️"} {name}</h4><span className="sub-code">{option.area || option.route || option.flight_number || trip.selected_destination || ""}</span></div><span className="status-badge">{option.rating || option.status || (quote ? "SANDBOX QUOTE" : "RESEARCH RESULT")}</span></div>
      {kind === "flight" ? <><p>{option.departure || "Departure not returned"} → {option.arrival || "Arrival not returned"} · {option.stops || "Stops not returned"} · {option.flight_number || ""}</p><div className="price-block"><strong className="price-val">{quote ? money(amount) : "Quote unavailable"}</strong><small>Simulated test price for {quote?.travelers || trip.request.travelers} traveler(s) · not an airline fare</small></div></> : <>
        {kind === "hotel" && <p>{option.amenities || "Property details were not returned by research."}</p>}
        {kind === "cab" && <p>{option.vehicle || "Vehicle details not returned"} · {option.duration || "Duration not returned"}</p>}
        <div className="price-block"><strong className="price-val">{amount != null && amount > 0 ? money(amount) : "Price not returned"}</strong><small>{quote ? kind === "hotel" ? `${money((quote.nightly_rate_minor || 0) / 100)} per night · ${quote.nights} night(s) · ${quote.rooms} room(s)` : "Simulated price" : option.price_note || "No price is available."}</small></div>
        {option.booking_url && <SafeLink href={option.booking_url}>Property source ↗</SafeLink>}
      </>}
      {isPaid ? <div className="option-confirmed">✓ Booking confirmed</div> : <div className="option-actions"><button className="secondary-btn" type="button" disabled={inItinerary || busy !== null} onClick={() => onAddToItinerary(kind, option)}>{inItinerary ? "Added to itinerary" : "Add to itinerary"}</button><button className="primary" type="button" disabled={loading || busy !== null || !quote || !amount} onClick={() => onSelect(kind, option)}>{loading ? "Opening checkout…" : inItinerary ? "Proceed to payment" : "Pay now"}</button></div>}
    </article>;
  })}</div></section>;
}

function TrainCards({ options, search, trip, busy, onSelect, onAddToItinerary }: {
  options: TravelOption[];
  search?: Trip["train_search"];
  trip: Trip;
  busy: string | null;
  onSelect: Props["onSelect"];
  onAddToItinerary: Props["onAddToItinerary"];
}) {
  const title = "Train schedules";
  if (!options.length) {
    const message = search?.message || "No train schedules were returned for this trip.";
    const unavailable = search?.status === "UNAVAILABLE";
    return <section className="dash-section"><div className="dash-section-header"><h3>{title}</h3><span className="section-tag">{unavailable ? "Search unavailable" : "No matches"}</span></div>
      <div className={`service-empty-state ${unavailable ? "is-unavailable" : ""}`}>
        <span className="service-empty-icon" aria-hidden="true">{unavailable ? "!" : "↗"}</span>
        <div><h4>{unavailable ? "Train search could not complete" : "No trains found for this route and date"}</h4><p>{message}</p>
          <small>Search: {trip.request.origin} → {trip.selected_destination || trip.request.destination || "destination"} · {trip.request.start_date}. Fare quotes may be unavailable; seat booking and ticket issuance are not provided here.</small>
        </div>
      </div></section>;
  }
  return <section className="dash-section"><div className="dash-section-header"><h3>{title}</h3><span className="section-tag">{search?.status === "SUGGESTIONS_RETURNED" ? "Nearby date suggestions" : "RailRadar · schedules + fare quotes"}</span></div>
    <p className="section-note">Checkout uses a TripMate simulated test price, not a supplier fare. No real seat is reserved.</p>
    {search?.status === "SUGGESTIONS_RETURNED" && <div className="train-date-notice" role="status"><strong>Nothing scheduled on {search.requested_date || trip.request.start_date}</strong><p>{search.message || "Here are the nearest dates with provider-returned schedules. The travel date is shown on each train card."}</p></div>}
    <div className="cards">{options.map((train, index) => {
    const name = train.train_name || train.name || `Train ${train.train_number || index + 1}`;
    const selected = busy === `train:${name}`;
    const added = (trip.itinerary_items || []).some((activity) => activity.booking_category === "train" && activity.title === name);
    const paid = trip.sandbox_bookings?.some((booking) => booking.success && paymentHas(booking.payment, "train", train));
    return <article className="data-card provider-card train-card" key={`${train.train_number || name}-${index}`}>
      <div className="card-header-row"><div><h4>🚆 {name}</h4><span className="sub-code">Train {train.train_number || "number unavailable"}</span></div><span className="status-badge">Schedule only</span></div>
      <div className="train-route"><div><small>FROM · {train.travel_date || "Date not returned"}</small><strong>{train.departure_time || "Time unavailable"}</strong><span>{train.departure_station || "Station not returned"}</span></div><span className="train-route-arrow" aria-hidden="true">→</span><div><small>TO</small><strong>{train.arrival_time || "Time unavailable"}</strong><span>{train.arrival_station || "Station not returned"}</span></div></div>
      <p>{train.duration || "Journey duration not returned"}{train.distance_km != null ? ` · ${train.distance_km} km` : ""}{train.run_days?.length ? ` · Runs ${train.run_days.join(", ")}` : ""}</p>
      <div className="price-block">
        {train.fare?.amount != null ? <>
          <strong className="price-val">{money(train.fare.amount)} <span className="train-fare-class">{train.fare.class_code} · {train.fare.quota_code}</span></strong>
          <small>{train.fare.provider} fare · simulated checkout</small>
          <small className="train-fare-disclaimer">{train.fare.note}</small>
          <details className="train-fare-details"><summary>Fare breakdown</summary><dl>{Object.entries(train.fare.breakdown || {}).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{money(value)}</dd></div>)}</dl></details>
        </> : <>
          <strong className="price-val">Fare unavailable</strong>
          <small>{train.price_note || "RailRadar returned the schedule but no fare quote. No fare has been estimated."}</small>
        </>}
      </div>
      {paid ? <div className="option-confirmed">✓ Booking confirmed</div> : <div className="option-actions"><button type="button" className="secondary-btn" disabled={added || busy !== null || !train.quote} onClick={() => onAddToItinerary("train", train)}>{added ? "Added to itinerary" : "Add to itinerary"}</button><button type="button" className="primary" disabled={busy !== null || !train.quote} onClick={() => onSelect("train", train)}>{selected ? "Opening checkout…" : added ? "Proceed to payment" : `Pay ${money((train.quote?.amount_minor || 0) / 100)}`}</button></div>}
      <small className="train-booking-readiness">Simulated test price only; no Railways seat is reserved and this is not a valid travel ticket.</small>
    </article>;
  })}</div></section>;
}

function paymentHas(payment: Payment | null | undefined, category: string, option: TravelOption) {
  return payment?.items?.some((item) => item.category === category && item.name === (option.name || option.airline || option.flight_number || option.train_name || option.train_number));
}

function Insights({ insights }: { insights?: Trip["travel_insights"] }) {
  if (!insights) return null;
  const labels: Record<string, string> = { photo_spots: "Viewpoints & photography", culinary_tips: "Local food", transit_hacks: "Local transit", packing_and_safety: "Packing & safety", creator_insights: "Travel insights" };
  const rows = Object.entries(insights).filter(([, value]) => value != null && value !== "" && (!Array.isArray(value) || value.length));
  if (!rows.length) return null;
  return <section className="dash-section"><div className="dash-section-header"><h3>Travel insights · {String(insights.destination || "")}</h3></div><div className="insights-columns-grid">{rows.map(([key, value]) => <div className="insights-col" key={key}><h4>{labels[key] || key.replaceAll("_", " ")}</h4>{Array.isArray(value) ? <ul>{value.map((item, index) => <li key={index}>{String(item)}</li>)}</ul> : <p>{String(value)}</p>}</div>)}</div></section>;
}

export function TripResults({ trip, conversation, onSelect, onAddToItinerary, bookingBusy, onReplan, replanBusy, replanError, replanProgress }: Props) {
  const [change, setChange] = useState("");
  const bookings = trip.sandbox_bookings || (trip.demo_booking ? [trip.demo_booking] : []);
  const activities = trip.itinerary_items || trip.itinerary || [];
  const costs = activities.reduce((sum, activity) => sum + (Number(activity.cost ?? activity.estimated_cost) || 0), 0);
  const bookedCosts = bookings.filter((booking) => booking.success).reduce((sum, booking) => sum + (booking.amount_minor || 0) / 100, 0);
  const total = costs + bookedCosts;
  const submitChange = async (value: string) => { if (!value.trim() || replanBusy || bookingBusy) return; if (await onReplan(value.trim())) setChange(""); };
  return <section className="result-section react-trip-results" id="trip-results">
    <div className="result-header"><div><h2>Your TripMate plan</h2><p className="section-note">Your itinerary, stays, and travel options in one place.</p></div><div className="header-action-group"><button className="secondary-btn" type="button" disabled={Boolean(bookingBusy)} onClick={() => document.getElementById("trip-change-chat")?.scrollIntoView({ behavior: "smooth", block: "center" })}>✦ Change this trip</button><button className="download-btn" type="button" onClick={() => window.print()}>Print / Save plan as PDF</button></div></div>
    <div className="dashboard" id="trip-print-area">
      <section className="trip-summary-banner"><div className="summary-hero"><div className="summary-dest-title"><h2>🌴 {trip.selected_destination || trip.request.destination || "Trip"}</h2><span className="origin-tag">Starting from <b>{trip.request.origin}</b></span></div><div className="summary-chips"><span className="summary-chip">📅 {trip.request.start_date} → {trip.request.end_date}</span><span className="summary-chip">👥 {trip.request.travelers} traveler(s) · {trip.request.traveler_type}</span><span className="summary-chip">⏱️ {trip.request.pace} pace</span><span className="summary-chip">🏨 {trip.request.accommodation}</span></div></div></section>
      {trip.warnings?.length ? <div className="warning-panel"><h3>Planner notes</h3><ul>{trip.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null}
      <section className="dash-section" id="itinerarySection"><div className="dash-section-header"><h3>Your itinerary</h3><span className="section-tag">New additions are highlighted</span></div><ActivityTimeline items={activities} onPay={onSelect} busy={bookingBusy} /></section>
      <OptionCards kind="flight" options={trip.flights || []} trip={trip} bookings={bookings} busy={bookingBusy} onSelect={onSelect} onAddToItinerary={onAddToItinerary} />
      <TrainCards options={trip.trains || []} search={trip.train_search} trip={trip} busy={bookingBusy} onSelect={onSelect} onAddToItinerary={onAddToItinerary} />
      <OptionCards kind="hotel" options={trip.hotels || []} trip={trip} bookings={bookings} busy={bookingBusy} onSelect={onSelect} onAddToItinerary={onAddToItinerary} />
      <OptionCards kind="cab" options={trip.cabs || []} trip={trip} bookings={bookings} busy={bookingBusy} onSelect={onSelect} onAddToItinerary={onAddToItinerary} />
      <section className="dash-section"><div className="dash-section-header"><h3>Budget summary</h3><span className="section-tag">Based on returned activity estimates and completed sandbox records</span></div><div className="budget-summary-box"><div className="budget-grid-rich"><div className="budget-item"><div className="budget-item-title"><span>Planned activities</span></div><strong className="budget-item-amount">{money(costs)}</strong></div><div className="budget-item"><div className="budget-item-title"><span>Successful sandbox bookings</span></div><strong className="budget-item-amount">{money(bookedCosts)}</strong></div><div className="budget-item is-confirmed"><div className="budget-item-title"><span>Known total</span></div><strong className="budget-item-amount">{money(total)}</strong></div></div>{trip.request.budget && <p>Trip budget: {trip.request.currency} {trip.request.budget.toLocaleString("en-IN")}{trip.request.currency === "INR" ? ` · ${total <= trip.request.budget ? "within budget" : `over by ${money(total - trip.request.budget)}`}` : " · comparison is unavailable because sandbox costs are INR"}</p>}</div></section>
      {bookings.length > 0 && <section className="dash-section"><div className="dash-section-header"><h3>Your bookings</h3></div><div className="cards">{bookings.map((booking, index) => <BookingCard key={booking.booking_id || index} booking={booking} />)}</div></section>}
      <Insights insights={trip.travel_insights} />
      {Array.isArray(trip.sources) && trip.sources.length > 0 && <details className="agent-progress"><summary>Research sources ({trip.sources.length})</summary><ul>{trip.sources.map((source, index) => { const row = source as Record<string, unknown>; return <li key={index}><SafeLink href={typeof row.url === "string" ? row.url : null}>{String(row.title || row.url || `Source ${index + 1}`)}</SafeLink>{row.snippet ? ` · ${String(row.snippet)}` : ""}</li>; })}</ul></details>}
    </div>
    <section className="planner-card itinerary-assistant" id="trip-change-chat">
      <div className="assistant-heading"><div><span className="change-chat-eyebrow">YOUR TRIP, YOUR WAY</span><div className="assistant-title">What would you like to change?</div><div className="assistant-subtitle">Update the pace, activities, or feel of your trip. Your dates, budget, and confirmed bookings stay in context.</div></div><span className="change-agent-mark" aria-hidden="true">✦</span></div>
      <div className="quick-changes" aria-label="Suggested trip changes">{["More nature", "Local food tour", "Spiritual places", "Less travel time", "Slower, relaxed pace"].map((item) => <button key={item} type="button" disabled={replanBusy || Boolean(bookingBusy)} onClick={() => void submitChange(item)}>{item}</button>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); void submitChange(change); }}>
        <label className="visually-hidden" htmlFor="replan-input">Describe how you want to change your trip</label>
        <div className="change-input"><textarea id="replan-input" value={change} onChange={(event) => setChange(event.target.value)} placeholder="For example: Make this a nature-focused trip with local food experiences, and keep each day relaxed." rows={2} disabled={replanBusy || Boolean(bookingBusy)} /><button className="primary change-submit" type="submit" disabled={replanBusy || Boolean(bookingBusy) || !change.trim()}>{replanBusy ? <><span className="change-spinner" aria-hidden="true" /> Planning…</> : <>Update my plan <span aria-hidden="true">→</span></>}</button></div>
        <div className="change-chat-footer"><span>✦ Your day-by-day plan will be refreshed</span><span>Enter your request above</span></div>
        {replanProgress && <div className="change-progress" role="status" aria-live="polite"><span className="change-spinner" aria-hidden="true" />{replanProgress}</div>}
        {replanError && <div className="error" role="alert">{replanError}</div>}
      </form>
      {conversation.length > 0 && <div className="trip-conversation" aria-live="polite" aria-label="Trip change conversation">{conversation.slice(-8).map((message, index) => <article className={`trip-message ${message.role}`} key={`${message.created_at}-${index}`}><strong>{message.role === "user" ? "You" : message.role === "assistant" ? "Planner agent" : "TripMate"}</strong><p>{message.content}</p><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time></article>)}</div>}
    </section>
  </section>;
}

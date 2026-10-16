import { useState, type ReactNode } from "react";
import type { Activity, BookingResult, Payment, Trip, TripMessage, TravelOption } from "./types";

type Props = {
  trip: Trip;
  conversation: TripMessage[];
  onSelect: (type: "hotel" | "cab" | "flight", option: TravelOption) => void;
  bookingBusy: string | null;
  paymentStatus: (id: string) => void;
  onReplan: (text: string) => Promise<boolean>;
  replanBusy: boolean;
  replanError: string | null;
};

const money = (value?: number | null) => value == null || !Number.isFinite(Number(value)) ? "Not returned" : `₹${Number(value).toLocaleString("en-IN")}`;
function SafeLink({ href, children }: { href?: string | null; children: ReactNode }) {
  if (!href) return null;
  try { const url = new URL(href); if (!(["https:", "http:"].includes(url.protocol))) return null; return <a href={url.href} target="_blank" rel="noreferrer">{children}</a>; } catch { return null; }
}

function ActivityTimeline({ items }: { items: Activity[] }) {
  if (!items.length) return <div className="empty-notice">The planning service returned no itinerary activities.</div>;
  const groups = new Map<string, Activity[]>();
  items.forEach((activity) => { const key = activity.date || "Date not returned"; groups.set(key, [...(groups.get(key) || []), activity]); });
  return <div className="itinerary-timeline">{Array.from(groups.entries()).map(([date, activities], index) => <section className="itinerary-day-block" key={date}>
    <div className="day-badge-header"><span className="day-number">Day {index + 1}</span><span className="day-date">{date}</span></div>
    <div className="day-activities">{activities.map((act, activityIndex) => <article className="activity-card" key={`${act.title}-${activityIndex}`}>
      <div className="activity-time">{act.start_time || "Time not returned"}{act.end_time ? ` – ${act.end_time}` : ""}</div>
      <div className="activity-content"><h4>{act.title || "Untitled activity"}</h4><p className="activity-location">📍 {act.location || "Location not returned"}</p>{act.description && <p>{act.description}</p>}{act.reason && <small>{act.reason}</small>}</div>
      <div className="activity-meta"><span className="status-badge">{act.status || act.cost_status || "PLANNED"}</span><span>{money(act.cost ?? act.estimated_cost)}</span></div>
    </article>)}</div>
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

function BookingCard({ booking, onRefresh }: { booking: BookingResult; onRefresh: (id: string) => void }) {
  const payment = booking.payment;
  const docs = payment?.documents;
  const [showDetails, setShowDetails] = useState(false);
  return <article className="data-card booking-record">
    <div className="card-header-row"><div><h3>{booking.status === "VERIFYING" ? "Checking saved booking with backend" : booking.success ? "Sandbox booking recorded" : "Sandbox booking not completed"}</h3><p>{booking.booking_id || "Booking reference not returned"}</p></div><span className={`status-badge ${booking.success ? "VERIFIED" : "UNAVAILABLE"}`}>{booking.status || payment?.status || "Unknown"}</span></div>
    <p>{booking.success ? "The server returned a successful sandbox payment and booking record." : booking.status === "VERIFYING" ? "This browser has a saved booking reference. The backend must confirm it before it is shown as paid." : booking.error || "No successful payment was returned."}</p>
    <dl className="booking-meta"><div><dt>Amount</dt><dd>{money((booking.amount_minor ?? payment?.amount_minor ?? 0) / 100)}</dd></div><div><dt>Payment</dt><dd>{payment?.payment_id || booking.payment_id || "Not returned"}</dd></div><div><dt>Transaction</dt><dd>{payment?.transaction_id || booking.transaction_id || "Not returned"}</dd></div></dl>
    {booking.progress?.length ? <details><summary>Payment agent steps</summary><ol>{booking.progress.map((entry, index) => <li key={`${entry.step}-${index}`} data-status={entry.status}>{entry.step || entry.label}</li>)}</ol></details> : null}
    {payment?.payment_id && <button type="button" onClick={() => onRefresh(payment.payment_id!)}>Refresh payment status</button>}
    {docs && <BookingDocumentWindow payment={payment!} />}
    {docs && <button type="button" onClick={() => setShowDetails((state) => !state)}>{showDetails ? "Hide returned documents" : "View returned documents"}</button>}
    {showDetails && docs && <div className="payment-agent-progress">{Object.entries(docs).filter(([key]) => key !== "label").map(([name, document]) => <article className="payment-document" key={name}><strong>{name.replaceAll("_", " ")}</strong><dl>{Object.entries(document).filter(([key, value]) => key !== "label" && value !== null && typeof value !== "object").map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{key === "amount_minor" ? money(Number(value) / 100) : String(value)}</dd></div>)}</dl></article>)}</div>}
  </article>;
}

function OptionCards({ kind, options, trip, bookings, busy, onSelect }: {
  kind: "hotel" | "cab" | "flight"; options: TravelOption[]; trip: Trip; bookings: BookingResult[]; busy: string | null; onSelect: Props["onSelect"];
}) {
  const title = kind === "hotel" ? "Accommodation Options (You choose; payment agent processes the sandbox booking)" : kind === "cab" ? "Local Transport & Cabs (You choose; payment agent processes the sandbox booking)" : "Flight schedules (availability/status data only)";
  if (!options.length) return <section className="dash-section"><div className="dash-section-header"><h3>{title}</h3></div><div className="empty-notice">No {kind === "cab" ? "local transport quotes" : kind === "hotel" ? "accommodation options" : "flight results"} were returned by the current backend workflow.</div></section>;
  const paid = (option: TravelOption) => bookings.some((booking) => booking.success && paymentHas(booking.payment, kind, option));
  return <section className="dash-section"><div className="dash-section-header"><h3>{title}</h3><span className="section-tag">{kind === "flight" ? "Schedule data" : "Sandbox quote"}</span></div><div className="cards">{options.map((option, index) => {
    const name = option.name || option.airline || `Option ${index + 1}`;
    const quote = option.quote;
    const amount = quote?.amount_minor != null ? quote.amount_minor / 100 : option.total_num ?? option.price_num;
    const loading = busy === `${kind}:${name}`;
    return <article className="data-card provider-card" key={`${name}-${quote?.quote_id || index}`}>
      <div className="card-header-row"><div><h4>{kind === "hotel" ? "🏨" : kind === "cab" ? "🚗" : "✈️"} {name}</h4><span className="sub-code">{option.area || option.route || option.flight_number || trip.selected_destination || ""}</span></div><span className="status-badge">{option.rating || option.status || (quote ? "SANDBOX QUOTE" : "RESEARCH RESULT")}</span></div>
      {kind === "flight" ? <><p>{option.departure || "Departure not returned"} → {option.arrival || "Arrival not returned"} · {option.stops || "Stops not returned"}</p><p>Flight schedule/status records are not purchasable fares; no ticket checkout is available through current API.</p><button type="button" onClick={() => onSelect("flight", option)}>Add schedule to plan</button></> : <>
        {kind === "hotel" && <p>{option.amenities || "Property details were not returned by research."}</p>}
        {kind === "cab" && <p>{option.vehicle || "Vehicle details not returned"} · {option.duration || "Duration not returned"}</p>}
        <div className="price-block"><strong className="price-val">{amount != null && amount > 0 ? money(amount) : "Price not returned"}</strong><small>{quote ? kind === "hotel" ? `${money((quote.nightly_rate_minor || 0) / 100)} per night · ${quote.nights} night(s) · ${quote.rooms} room(s) · sandbox quote` : `${quote.quote_id} · sandbox quote` : option.price_note || "No server quote is available."}</small></div>
        {option.booking_url && <SafeLink href={option.booking_url}>Property source ↗</SafeLink>}
        {paid(option) ? <button className="primary added-btn" disabled type="button">✓ Sandbox booking confirmed</button> : <button className="primary" type="button" disabled={loading || busy !== null || !quote || !amount} onClick={() => onSelect(kind, option)}>{loading ? "Payment agent is working…" : "Select & continue to agent checkout"}</button>}
      </>}
    </article>;
  })}</div></section>;
}

function paymentHas(payment: Payment | null | undefined, category: string, option: TravelOption) {
  return payment?.items?.some((item) => item.category === category && item.name === (option.name || option.airline));
}

function Insights({ insights }: { insights?: Trip["travel_insights"] }) {
  if (!insights) return null;
  const labels: Record<string, string> = { photo_spots: "Viewpoints & photography", culinary_tips: "Local food", transit_hacks: "Local transit", packing_and_safety: "Packing & safety", creator_insights: "Travel insights" };
  const rows = Object.entries(insights).filter(([, value]) => value != null && value !== "" && (!Array.isArray(value) || value.length));
  if (!rows.length) return null;
  return <section className="dash-section"><div className="dash-section-header"><h3>Travel insights · {String(insights.destination || "")}</h3></div><div className="insights-columns-grid">{rows.map(([key, value]) => <div className="insights-col" key={key}><h4>{labels[key] || key.replaceAll("_", " ")}</h4>{Array.isArray(value) ? <ul>{value.map((item, index) => <li key={index}>{String(item)}</li>)}</ul> : <p>{String(value)}</p>}</div>)}</div></section>;
}

export function TripResults({ trip, conversation, onSelect, bookingBusy, paymentStatus, onReplan, replanBusy, replanError }: Props) {
  const [change, setChange] = useState("");
  const [showAssistant, setShowAssistant] = useState(false);
  const bookings = trip.sandbox_bookings || (trip.demo_booking ? [trip.demo_booking] : []);
  const activities = trip.itinerary_items || trip.itinerary || [];
  const costs = activities.reduce((sum, activity) => sum + (Number(activity.cost ?? activity.estimated_cost) || 0), 0);
  const bookedCosts = bookings.filter((booking) => booking.success).reduce((sum, booking) => sum + (booking.amount_minor || 0) / 100, 0);
  const total = costs + bookedCosts;
  const submitChange = async (value: string) => { if (!value.trim() || replanBusy || bookingBusy) return; if (await onReplan(value.trim())) setChange(""); };
  return <section className="result-section react-trip-results" id="trip-results">
    <div className="result-header"><div><h2>Your Multi-Agent Travel Plan</h2><p className="section-note">Trip {trip.trip_id} · Planning thread {trip.thread_id || "not returned"}</p></div><div className="header-action-group"><button className="secondary-btn" type="button" disabled={Boolean(bookingBusy)} onClick={() => setShowAssistant((show) => !show)}>✨ Adjust itinerary</button><button className="download-btn" type="button" onClick={() => window.print()}>Print / Save plan as PDF</button></div></div>
    <div className="dashboard" id="trip-print-area">
      <section className="trip-summary-banner"><div className="summary-hero"><div className="summary-dest-title"><h2>🌴 {trip.selected_destination || trip.request.destination || "Trip"}</h2><span className="origin-tag">Starting from <b>{trip.request.origin}</b></span></div><div className="summary-chips"><span className="summary-chip">📅 {trip.request.start_date} → {trip.request.end_date}</span><span className="summary-chip">👥 {trip.request.travelers} traveler(s) · {trip.request.traveler_type}</span><span className="summary-chip">⏱️ {trip.request.pace} pace</span><span className="summary-chip">🏨 {trip.request.accommodation}</span></div></div></section>
      {trip.warnings?.length ? <div className="warning-panel"><h3>Planner notes</h3><ul>{trip.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null}
      {Array.isArray(trip.progress) && trip.progress.length > 0 && <details className="agent-progress"><summary>Planning agent progress ({trip.progress.length})</summary><ol>{trip.progress.map((item, index) => <li key={index}>{item.label || item.step || JSON.stringify(item)}</li>)}</ol></details>}
      <section className="dash-section" id="itinerarySection"><div className="dash-section-header"><h3>Day-by-Day Itinerary</h3><span className="section-tag">Current backend plan</span></div><ActivityTimeline items={activities} /></section>
      <OptionCards kind="flight" options={trip.flights || []} trip={trip} bookings={bookings} busy={bookingBusy} onSelect={onSelect} />
      <OptionCards kind="hotel" options={trip.hotels || []} trip={trip} bookings={bookings} busy={bookingBusy} onSelect={onSelect} />
      <OptionCards kind="cab" options={trip.cabs || []} trip={trip} bookings={bookings} busy={bookingBusy} onSelect={onSelect} />
      <section className="dash-section"><div className="dash-section-header"><h3>Budget summary</h3><span className="section-tag">Based on returned activity estimates and completed sandbox records</span></div><div className="budget-summary-box"><div className="budget-grid-rich"><div className="budget-item"><div className="budget-item-title"><span>Planned activities</span></div><strong className="budget-item-amount">{money(costs)}</strong></div><div className="budget-item"><div className="budget-item-title"><span>Successful sandbox bookings</span></div><strong className="budget-item-amount">{money(bookedCosts)}</strong></div><div className="budget-item is-confirmed"><div className="budget-item-title"><span>Known total</span></div><strong className="budget-item-amount">{money(total)}</strong></div></div>{trip.request.budget && <p>Trip budget: {trip.request.currency} {trip.request.budget.toLocaleString("en-IN")}{trip.request.currency === "INR" ? ` · ${total <= trip.request.budget ? "within budget" : `over by ${money(total - trip.request.budget)}`}` : " · comparison is unavailable because sandbox costs are INR"}</p>}</div></section>
      {bookings.length > 0 && <section className="dash-section"><div className="dash-section-header"><h3>Booking records</h3><span className="section-tag">Backend payment status</span></div><div className="cards">{bookings.map((booking, index) => <BookingCard key={booking.payment_id || booking.booking_id || index} booking={booking} onRefresh={paymentStatus} />)}</div><p className="section-note">Sandbox bookings exercise the local payment ledger and document workflow. They do not reserve supplier inventory or transfer real funds.</p></section>}
      <Insights insights={trip.travel_insights} />
      {Array.isArray(trip.sources) && trip.sources.length > 0 && <details className="agent-progress"><summary>Research sources ({trip.sources.length})</summary><ul>{trip.sources.map((source, index) => { const row = source as Record<string, unknown>; return <li key={index}><SafeLink href={typeof row.url === "string" ? row.url : null}>{String(row.title || row.url || `Source ${index + 1}`)}</SafeLink>{row.snippet ? ` · ${String(row.snippet)}` : ""}</li>; })}</ul></details>}
    </div>
    {showAssistant && <section className="planner-card itinerary-assistant"><div className="assistant-heading"><div><div className="assistant-title">✨ Replanning Agent</div><div className="assistant-subtitle">Describe the change. The agent updates the itinerary using the saved trip and current version.</div></div><button type="button" className="modal-close-btn" onClick={() => setShowAssistant(false)} aria-label="Close">×</button></div><div className="trip-conversation" aria-live="polite"><h3>Trip change history</h3>{conversation.length ? conversation.map((message, index) => <article className={`trip-message ${message.role}`} key={`${message.created_at}-${index}`}><strong>{message.role === "user" ? "You" : message.role === "assistant" ? "Planner agent" : "TripMate"}</strong><p>{message.content}</p><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time></article>) : <p>No saved change requests yet.</p>}</div><div className="quick-changes">{["Cheaper and budget-friendly", "Less walking and more cabs", "Add authentic local food experiences", "More cultural and heritage spots", "More nature viewpoints and scenic spots", "Make itinerary slower and more relaxed"].map((item) => <button key={item} type="button" disabled={replanBusy} onClick={() => void submitChange(item)}>{item}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); void submitChange(change); }}><label htmlFor="replan-input">What would you like changed?</label><div className="change-input"><input id="replan-input" value={change} onChange={(event) => setChange(event.target.value)} placeholder="e.g. Replace the walking tour with a boat ride" /><button className="primary" type="submit" disabled={replanBusy || !change.trim()}>{replanBusy ? "Updating…" : "Update itinerary"}</button></div>{replanError && <div className="error" role="alert">{replanError}</div>}</form></section>}
  </section>;
}

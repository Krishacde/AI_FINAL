import { useEffect, useState, type FormEvent } from "react";
import type { TripRequest } from "./types";

const interestsList = ["Nature", "Culture", "Relaxation", "Food", "Beaches", "Heritage", "Adventure", "Hill Station"];
export type Handoff = { destinations: string[]; origin: string; start_date: string; end_date: string; pace?: string; budget?: number | null };

type Props = {
  onSubmit: (request: TripRequest) => void;
  onOpenDiscovery: () => void;
  busy: boolean;
  error: string | null;
  initial?: Handoff | null;
};

function dateIn(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function PlannerForm({ onSubmit, onOpenDiscovery, busy, error, initial }: Props) {
  const params = new URLSearchParams(window.location.search);
  const [destination, setDestination] = useState(params.get("destination") || initial?.destinations.join(", ") || "");
  const [origin, setOrigin] = useState(params.get("origin") || initial?.origin || "");
  const [startDate, setStartDate] = useState(params.get("start_date") || initial?.start_date || dateIn(7));
  const [endDate, setEndDate] = useState(params.get("end_date") || initial?.end_date || dateIn(11));
  const [travelers, setTravelers] = useState(1);
  const [travelerType, setTravelerType] = useState("Solo");
  const [budget, setBudget] = useState(params.get("budget") || (initial?.budget ? String(initial.budget) : ""));
  const [currency, setCurrency] = useState("INR");
  const [pace, setPace] = useState(params.get("pace") || initial?.pace || "balanced");
  const [accommodation, setAccommodation] = useState("Mid-range hotel");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    if (params.get("autostart") === "true" && destination && origin) {
      const next = new URL(window.location.href);
      next.searchParams.delete("autostart");
      window.history.replaceState({}, "", next);
      const payload = makeRequest();
      onSubmit(payload);
    }
    // This runs once for a discovery handoff, not on every field change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function makeRequest(): TripRequest {
    const destinations = destination.split(",").map((item) => item.trim()).filter(Boolean);
    return {
      planning_mode: initial ? "discover" : "known",
      destination: destinations.join(", ") || null,
      selected_destinations: destinations,
      origin: origin.trim(),
      start_date: startDate,
      end_date: endDate,
      travelers,
      traveler_type: travelerType,
      budget: budget ? Number(budget) : null,
      currency,
      interests,
      pace: pace as TripRequest["pace"],
      accommodation,
      special_requirements: specialRequirements.trim() || null,
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(makeRequest());
  }

  return (
    <>
      <section className="hero-section">
        <div className="badge">✈️ TripMate · Your travel planner</div>
        <h1>Plan a trip that feels like yours.</h1>
        <p>Tell us where you’re going, and TripMate will shape a day-by-day plan around your dates and preferences.</p>
      </section>
      {initial && <section className="discovery-handoff-banner"><div className="banner-content"><span className="banner-icon">✨</span><div><strong>Destination loaded from Discovery</strong><p>Review the trip details and let the planner build your itinerary.</p></div></div></section>}
      <section className="planner-card" id="planner">
        <div className="step-label">Trip Planning Hub</div>
        <h2>How would you like to plan?</h2>
        <div className="mode-grid">
          <div className="mode-card active"><span>📍</span><strong>Plan a destination</strong><small>Build an itinerary around the places you want to visit.</small></div>
          <button className="mode-card" type="button" onClick={onOpenDiscovery}><span>✨</span><strong>Help me choose</strong><small>Scout evidence-backed getaways from your starting point.</small></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="destination-field">📍 Destination(s)<input required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Alleppey, Thekkady or Kyoto, Japan" /></label>
            <label>🚩 Origin / Starting City<input required value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Mumbai" /></label>
            <label>📅 Start date<input required type="date" min={dateIn(0)} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label>📅 End date<input required type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            <label>👥 Travellers<select value={travelers} onChange={(e) => setTravelers(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => <option key={n} value={n}>{n} {n === 1 ? "Person" : "People"}</option>)}</select></label>
            <label>🎒 Trip style<select value={travelerType} onChange={(e) => setTravelerType(e.target.value)}>{["Solo", "Couple", "Family", "Friends"].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>💰 Budget (optional)<input type="number" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 50000" /></label>
            <label>💱 Currency<select value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option></select></label>
            <label>⏱️ Travel pace<select value={pace} onChange={(e) => setPace(e.target.value)}><option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="fast">Fast-paced</option></select></label>
            <label>🏨 Stay preference<select value={accommodation} onChange={(e) => setAccommodation(e.target.value)}>{["Budget hotel", "Mid-range hotel", "Boutique hotel", "Luxury resort"].map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <fieldset className="choices"><legend>Interests &amp; Experiences</legend><div id="interests">{interestsList.map((tag) => <button className={interests.includes(tag) ? "selected" : ""} type="button" key={tag} aria-pressed={interests.includes(tag)} onClick={() => setInterests((current) => current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag])}>{tag}</button>)}</div></fieldset>
          <label className="full">📝 Special requirements<input value={specialRequirements} onChange={(e) => setSpecialRequirements(e.target.value)} placeholder="Optional: less walking, vegetarian food, accessibility needs…" /></label>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="agent-action-row"><button className="primary" type="submit" disabled={busy}>{busy ? <><span className="loader" /> Planning your trip…</> : <>Build my trip plan <span>→</span></>}</button></div>
          <p className="section-note">Your trip and itinerary changes are saved so you can come back anytime.</p>
        </form>
      </section>
    </>
  );
}

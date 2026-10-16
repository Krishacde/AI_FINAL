import { useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import type { Destination } from "./types";
import type { Handoff } from "./PlannerForm";

const interestsList = ["Nature", "Culture", "Relaxation", "Food", "Beaches", "Heritage", "Adventure", "Hill Station"];
const dateIn = (days: number) => {
  const date = new Date(); date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

type Props = { onPlan: (handoff: Handoff) => void };

export function DiscoveryPage({ onPlan }: Props) {
  const today = dateIn(0);
  const [origin, setOrigin] = useState(" ");
  const [startDate, setStartDate] = useState(dateIn(7));
  const [endDate, setEndDate] = useState(dateIn(11));
  const [pace, setPace] = useState("balanced");
  const [budget, setBudget] = useState("flexible");
  const [interests, setInterests] = useState<string[]>([]);
  const [cards, setCards] = useState<Destination[]>([]);
  const [selected, setSelected] = useState<Destination[]>([]);
  const [summary, setSummary] = useState("");
  const [progress, setProgress] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Destination | null>(null);
  const controller = useRef<AbortController | null>(null);
  const days = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return Math.floor((new Date(`${endDate}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime()) / 86400000) + 1;
  }, [startDate, endDate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (days < 1 || days > 30) { setError("Choose a date range of 1 to 30 days."); return; }
    const active = new AbortController(); controller.current = active;
    setBusy(true); setError(null); setProgress([]);
    try {
      const month = new Date(`${startDate}T12:00:00`).toLocaleString("en-US", { month: "long" });
      const year = Number(startDate.slice(0, 4));
      const result = await api.discover({ origin: origin.trim(), month, year, start_date: startDate, end_date: endDate, days,
        interests, pace, budget: budget === "flexible" ? null : Number(budget), mood: interests.slice(0, 2).join(" + ") || "Nature & Culture" }, active.signal);
      setCards(result.destinations || []); setSelected([]); setSummary(result.scout_summary || "");
      setProgress(Array.isArray(result.progress) ? result.progress : []);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") setError("Research paused. You can submit a new search when ready.");
      else setError(cause instanceof Error ? cause.message : "Destination research failed.");
    } finally { setBusy(false); controller.current = null; }
  }

  function plan(destinations: Destination[]) {
    if (!destinations.length) return;
    onPlan({ destinations: destinations.map((card) => card.name), origin: origin.trim(), start_date: startDate, end_date: endDate,
      pace, budget: budget === "flexible" ? null : Number(budget) });
  }

  function toggle(card: Destination) {
    setSelected((current) => current.some((item) => item.name === card.name) ? current.filter((item) => item.name !== card.name) : [...current, card]);
  }

  return <main className="app-container discovery-page">
    <a className="back-link" href="/">← Back to Trip Planner</a>
    <section className="hero-section"><div className="badge">✦ Multi-Agent Destination Scout</div><h1>Help me choose a destination.</h1><p>Share your starting point, dates, and interests. The existing discovery agents research and rank candidate destinations.</p></section>
    <section className="planner-card"><div className="step-label">Flow 2 · Discovery Scout</div><h2>Where and when are you starting?</h2>
      <form onSubmit={submit}>
        <div className="form-grid discover-main-grid">
          <label>📍 Starting / Nearby Location<input required value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Mumbai or Delhi" /></label>
          <label>📅 Start date<input required type="date" min={today} value={startDate} onChange={(e) => { setStartDate(e.target.value); const date = new Date(`${e.target.value}T12:00:00`); date.setDate(date.getDate() + 4); setEndDate((old) => old < e.target.value ? date.toISOString().slice(0, 10) : old); }} /></label>
          <label>📅 End date<input required type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <label>Year<select value={startDate.slice(0, 4)} onChange={(e) => { const month = startDate.slice(5, 7); const day = startDate.slice(8, 10); setStartDate(`${e.target.value}-${month}-${day}`); }}><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></label>
        </div>
        <details className="preferences-accordion"><summary>✨ Optional Preferences (Interests, Mood, Pace)</summary>
          <fieldset className="choices"><legend>What kind of experiences do you prefer?</legend><div>{interestsList.map((tag) => <button type="button" key={tag} aria-pressed={interests.includes(tag)} className={interests.includes(tag) ? "selected" : ""} onClick={() => setInterests((value) => value.includes(tag) ? value.filter((item) => item !== tag) : [...value, tag])}>{tag}</button>)}</div></fieldset>
          <div className="form-grid"><label>Travel pace<select value={pace} onChange={(e) => setPace(e.target.value)}><option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="fast">Fast-paced</option></select></label><label>Approx. Budget<select value={budget} onChange={(e) => setBudget(e.target.value)}><option value="flexible">Flexible</option><option value="30000">Under ₹30,000</option><option value="60000">Under ₹60,000</option><option value="120000">Under ₹1,20,000</option></select></label></div>
        </details>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="agent-action-row"><button className="primary" disabled={busy} type="submit">{busy ? <><span className="loader" /> Researching destinations…</> : <>Scout Destinations <span>→</span></>}</button>{busy && <button className="cancel-btn" type="button" onClick={() => controller.current?.abort()}>Pause research</button>}</div>
      </form>
    </section>
    {busy && <section className="result-section"><h2>LangGraph Destination Scout</h2><p className="progress-active">Research request is running. The backend reports detailed agent progress when the operation returns.</p></section>}
    {progress.length > 0 && <section className="result-section"><h2>Agent progress</h2><div className="progress-list">{progress.map((item, index) => <pre key={index}>{typeof item === "string" ? item : JSON.stringify(item, null, 2)}</pre>)}</div></section>}
    {cards.length > 0 && <section className="result-section"><div className="result-header"><div><h2>Recommended Destinations</h2><p className="section-note">{summary}</p></div></div><div className="cards clean-destinations-grid">{cards.map((card) => {
      const isSelected = selected.some((item) => item.name === card.name);
      return <article className={`data-card clean-destination-card ${isSelected ? "is-selected" : ""}`} key={card.name}>
        <div className="card-header-row"><div className="dest-title-group"><h3>🌴 {card.name}</h3><span className="dest-region">{card.region}</span></div><div className="badge-group"><span className="match-score-badge">{card.match_score ?? "—"}% Match</span><span className={`status-badge ${card.status || "AI_RECOMMENDATION"}`}>{card.status || "AI_RECOMMENDATION"}</span></div></div>
        <div className="card-section"><span className="card-label">Why visit this month?</span><p className="card-text">{card.why_visit || "No explanation was returned."}</p></div>
        {card.special_this_month && <div className="card-section"><span className="card-label">✨ Seasonal highlight</span><p className="card-text">{card.special_this_month} · {card.special_is_verified ? "Verified for year" : "Check current dates"}</p></div>}
        <div className="card-section"><span className="card-label">Best for</span><div className="tag-pills">{(card.best_for || []).map((tag) => <span className="tag-pill" key={tag}>{tag}</span>)}</div></div>
        <div className="card-section"><span className="card-label">Travel connectivity</span><p className="travel-text">{card.travel_time || "Not available"}</p></div>
        <div className="card-action-row"><button type="button" className={`toggle-trip-btn ${isSelected ? "added" : ""}`} onClick={() => toggle(card)}>{isSelected ? "✓ Added" : "+ Add to Trip"}</button><button type="button" className="primary-subtle" onClick={() => plan([card])}>Plan Itinerary →</button><button type="button" onClick={() => setDetails(card)}>Details</button></div>
      </article>;
    })}</div>{summary && <p className="section-note">{summary}</p>}{cards.length === 0 && <p>No destinations were returned for this search.</p>}</section>}
    {selected.length > 0 && <aside className="selection-drawer"><div className="selection-drawer-content"><div className="selection-info"><span className="selection-count-badge">{selected.length}</span><div><strong>Selected Destinations</strong><div className="selected-chips">{selected.map((card) => <span className="selected-chip" key={card.name}>{card.name}<button type="button" aria-label={`Remove ${card.name}`} onClick={() => toggle(card)}>×</button></span>)}</div></div></div><button className="primary continue-btn" type="button" onClick={() => plan(selected)}>Continue to Trip Planning →</button></div></aside>}
    {details && <div className="modal-overlay" role="presentation" onClick={() => setDetails(null)}><section className="modal-content" role="dialog" aria-modal="true" aria-labelledby="destination-modal-title" onClick={(e) => e.stopPropagation()}><div className="modal-header"><h2 id="destination-modal-title">{details.name} · {details.region}</h2><button type="button" className="modal-close-btn" onClick={() => setDetails(null)} aria-label="Close">×</button></div><div className="modal-body"><p><strong>Match score:</strong> {details.match_score ?? "—"}%</p><p><strong>Why visit:</strong> {details.why_visit || "Not returned"}</p><p><strong>Attractions:</strong> {(details.key_attractions || []).join(" · ") || "Not returned"}</p><p><strong>Weather:</strong> {details.weather_summary || "Not returned"}</p><p><strong>Budget:</strong> {details.estimated_budget || "Not returned"}</p><p><strong>Travel:</strong> {details.travel_time || "Not returned"}</p><p>{details.source_url && <a href={details.source_url} target="_blank" rel="noreferrer">{details.source || "Source"} ↗</a>}</p></div></section></div>}
    <footer>Gemini Reasoning · LangGraph Orchestration · Evidence Pipeline</footer>
  </main>;
}

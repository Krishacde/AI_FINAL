# React migration audit and API map

## Current architecture

- FastAPI entry point: `app.py`; planning graph and request schemas: `backend.py`.
- Agent code: `agents/`; quote, cache, and payment ledger: `services/`.
- Existing browser application: `templates/index.html`, `templates/discover.html`, `static/script.js`, `static/discover.js`, and `static/style.css`.
- Existing pages are server-rendered Jinja templates with imperative browser JavaScript. No React package, frontend build, or `package.json` existed at audit time.
- The API and browser are same-origin in the existing deployment. Vite development must proxy backend routes; production must serve the built React application through FastAPI.

## Feature to API map

| Existing feature | Existing endpoint / behavior | React migration requirement |
|---|---|---|
| Main planner form and trip graph | `POST /api/trips`; request includes origin, destination(s), dates, travelers, budget/currency, interests, pace, accommodation, special requirements, optional `thread_id` and `request_id`; response `{success, trip}` | Keep the full input model; use request IDs; render returned graph state and warnings; pass `thread_id` on continuation where supported |
| Destination scout | `POST /api/discover`; origin, month/year, date range/days, interests, pace, budget, mood; returns destinations, summary, progress, warnings | Keep multi-select, cards/details, progress, cancellation, direct planning and handoff metadata |
| Itinerary adjustment | `POST /api/trips/replan`; current itinerary, `trip_id`, `change_text`, and trip context; returns updated activities/summary and optional accommodation results | Send latest backend itinerary/context; replace only updated plan and explicitly returned accommodation results; prevent stale results |
| Human provider choice and sandbox booking | `POST /api/trips/{trip_id}/selections`; provider type/option/context; hotel/cab call the payment agent; flight selection currently only returns a plan selection | Human chooses; use server quote as displayed; show real response/status/progress; never claim success on a failed response |
| Sandbox wallet | `GET /api/sandbox/wallet`; `POST /api/sandbox/wallet/topups` with amount in paise and idempotency key | Display balance; validate whole INR top-up amount; refresh on load and after transaction; surface errors |
| Payment status | `GET /api/sandbox/payments/{payment_id}` | Retrieve transaction status when a payment ID is available; backend status is authoritative |
| API readiness | `GET /api/diagnostics`; `GET /health` | Provide a diagnostics/readiness panel and useful API/network errors |
| Natural-language legacy request | `POST /api/travel` accepts message/optional `thread_id`; currently calls a fallback that tells the user to use guided planning and returns an answer plus empty/limited results | Preserve the endpoint contract and communicate its current backend limitation honestly; do not imply it supports persistent chat or replan |
| Legacy interactive real-payment flow | `/payment-demo` and `/api/payments/hotel/*` return HTTP 410 | Preserve the route behavior and make its retired state clear if linked; do not resurrect or claim real payments work |
| PDF export | Existing client-side plan export and booking document print/save flow | Export actual current itinerary or returned transaction documents only; never invent booking success |

## Backend limitations and persistence changes

- The trip graph has no LangGraph checkpointer. The new SQLite trip store persists trip request/context, the current snapshot, changed itinerary versions, and planner/edit messages independently of graph checkpointing. Replanning loads the saved trip and uses an expected-version check.
- `/api/travel` remains a limited legacy request endpoint; the supported persistent edit path is `/api/trips/replan`.
- Flight data is schedule/status research, not a purchasable fare or ticket. Cab options are local simulated quotes. Hotel rates and sandbox bookings are simulated and do not reserve supplier inventory or transfer money.
- The trip database and payment ledger are separate SQLite/PostgreSQL responsibilities. Payment status is checked against the ledger; Redis remains non-authoritative cache.
- The application has no user authentication, so saved-trip APIs are single-user/demo scoped until ownership checks are implemented.

## Integration acceptance checklist

- [x] React production build and Python suite pass; FastAPI serves `/`, `/discover`, and `/trips/{trip_id}`.
- [x] Saved-trip APIs list, restore, rename, delete, and expose messages and itinerary versions.
- [x] Replan loads stored state and rejects stale expected itinerary versions.
- [x] Booking references and confirmed itinerary entries are persisted after ledger success.
- [x] Browser reload uses a trip ID reference and fetches backend state; payment statuses are reverified.
- [ ] Redis server connectivity remains dependent on a running Redis service; process-local cache is the fallback.
- [ ] Multi-user ownership/authentication, real supplier inventory, real payment processing, and bookable flight fares remain external product work.

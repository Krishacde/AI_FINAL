---
slug: flow
title: Key flows
role: key flows
updated: "2026-10-26T14:29:50"
---

# Key flows

## Plan, choose, pay, confirm, and return

```mermaid
sequenceDiagram
  participant U as Traveler
  participant UI as React app
  participant API as FastAPI
  participant A as Payment agent
  participant M as LLM
  participant W as Wallet service
  participant T as SQLite trip store
  U->>UI: Choose a hotel, cab, flight, or train
  UI->>UI: Open sandbox checkout and show processing
  UI->>API: POST selection with idempotency key
  API->>API: Validate saved option and server quote
  API->>W: Create or find idempotent payment
  loop One no-argument tool per turn
    A->>M: Frozen order summary and allowed tools
    M-->>A: Choose one tool
    A->>A: Validate tool name and empty arguments
    A->>W: Read policy / reserve / confirm / capture as requested
    W-->>A: Structured result; rules rechecked in code
  end
  A->>W: Release or refund if flow failed
  A-->>API: Backend-built status, trace, and booking result
  API->>T: Persist confirmed booking and itinerary
  API-->>UI: Return authoritative booking and trip
  UI->>UI: Show receipt and teal highlight for new itinerary item
  UI-->>U: Checkout return button closes window
```

The agent can only choose among fixed, no-argument tools. It cannot provide a price or change the buyer. Server code validates each tool call, caps the loop, rechecks wallet policy at reservation and capture, and reconciles failures. The booking is confirmed before capture. If model credentials are absent, the same guarded tools run through a safe offline sequence. Closing the checkout window does not cancel backend processing; the trip page can reload saved status and documents.

## Replanning

The API loads the saved trip, checks the expected itinerary version, and passes the current plan and request context to the replanning agent. Confirmed booking entries remain in the itinerary. After a successful update, new or changed activities receive a short teal highlight; the prior plan remains visible if the request fails.

## Payment authority and simulated fares

TripStore keeps booking references and itinerary history. `services/wallet.py` is authoritative for simulated wallet and payment state. Hotels and cabs use catalog-backed sandbox quotes. Flight and train schedules receive deterministic TripMate test prices; those prices are not supplier fares, and generated documents are not valid tickets. No real funds or supplier inventory are involved.

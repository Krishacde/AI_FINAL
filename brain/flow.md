---
slug: flow
title: Key flows
role: key flows
updated: "2026-10-14T13:07:42"
---

# Key flows

## Plan, save, restore, and book

```mermaid
sequenceDiagram
  participant U as Traveler
  participant UI as React app
  participant API as FastAPI
  participant A as LangGraph agents
  participant C as Redis / local cache
  participant T as SQLite trip store
  participant P as Payment agent
  participant L as SQLite/PostgreSQL payment ledger

  U->>UI: Submit trip preferences
  UI->>API: POST /api/trips with idempotent request ID
  API->>A: Run planning graph
  A->>C: Read/write eligible public search evidence
  A-->>API: Return validated itinerary and options
  API->>T: Save trip, initial itinerary version, and conversation entry
  API-->>UI: Return authoritative trip ID and plan
  UI->>API: GET /api/trips/{trip_id} on refresh or direct link
  API->>T: Restore saved trip and current version
  T-->>UI: Return trip snapshot
  U->>UI: Select a hotel or cab
  UI->>API: POST /api/trips/{trip_id}/selections
  API->>P: Validate quote, wallet, budget, policy, and idempotency
  P->>L: Record sandbox payment and booking state
  P-->>API: Return verified result and documents
  API->>T: Save booking references and updated itinerary version
  API-->>UI: Return backend-confirmed booking and trip state
```

## Replanning

The API loads the current trip snapshot from SQLite, checks the caller's expected itinerary version, and passes the stored itinerary and request context to the replanning agent. A stale version is rejected rather than overwriting a newer plan. Successful changes are saved as a new version with the user request and assistant summary. The last successful plan remains intact if the workflow fails. Confirmed sandbox booking entries are preserved during itinerary-only edits.

## Cache and payment authority

Redis caches eligible public provider research using normalized input keys and TTLs. Cache failure falls back to bounded in-process memory. Trip snapshots and versions are durable in SQLite. Wallet and payment status come from the payment ledger; frontend storage and Redis are never authoritative for money movement.

## Boundaries

Sandbox rates and booking documents exercise agent selection, policy checks, ledger state, idempotency, and itinerary updates. They do not transfer real funds or reserve supplier inventory. Flight data is schedule/status research rather than a purchasable ticket. The app has no user authentication yet, so durable trip routes must receive ownership controls before multi-user deployment.

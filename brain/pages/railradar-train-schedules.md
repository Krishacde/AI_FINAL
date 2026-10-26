---
id: railradar-train-schedules
title: RailRadar results are timetable-only
category: decision
status: active
tags: [railradar, trains, provider-safety]
created: "2026-10-25T14:14:30"
updated: "2026-10-25T14:14:36"
---

<!-- compiled_truth -->
## Decision

TripMate integrates RailRadar for optional train timetable discovery only. Search results must be provider-returned and labeled as schedules; the application must not invent train services, fares, seat availability, confirmed bookings, or tickets. Adding a schedule to an itinerary is a persisted itinerary edit, not a booking or payment.

## Rationale

The trains-between API returns train identity and timetable fields. Fares, availability, reservations, and ticketing are separate provider capabilities and are not implemented in this project. Provider lookup failures or missing credentials must leave the rest of trip planning available. Cache station lookups and route schedules to reduce quota use.


## Timeline

- time: 2026-10-25T14:14:30
  kind: decision
  summary: "Created this page: RailRadar results are timetable-only"
  source: TripMate implementation and RailRadar API documentation
  affects: [railradar-train-schedules]

- time: 2026-10-25T14:14:36
  kind: decision
  summary: "Integrated schedule-only RailRadar discovery; prohibit fabricated prices and booking claims"
  source: RailRadar API docs and TripMate implementation
  affects: [railradar-train-schedules]

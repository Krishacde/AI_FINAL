import type { BookingResult, Destination, Payment, ReplanResponse, Trip, TripRequest, Wallet } from "./types";

type ApiEnvelope<T> = { success?: boolean; error?: string } & T;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Could not reach TripMate. Check that the Python backend is running and try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || `TripMate request failed (${response.status}).`);
  }
  return data as T;
}

export const api = {
  savedTrips: (signal?: AbortSignal) => request<ApiEnvelope<{ trips: Array<{ trip_id: string; name: string; destination?: string; updated_at: string; current_version: number }> }>>("/api/trips", { signal }),
  getTrip: (tripId: string, signal?: AbortSignal) => request<ApiEnvelope<{ trip: Trip }>>(`/api/trips/${encodeURIComponent(tripId)}`, { signal }),
  tripMessages: (tripId: string, signal?: AbortSignal) => request<ApiEnvelope<{ messages: Array<{ role: string; content: string; created_at: string }> }>>(`/api/trips/${encodeURIComponent(tripId)}/messages`, { signal }),
  tripVersions: (tripId: string, signal?: AbortSignal) => request<ApiEnvelope<{ versions: Array<{ version: number; change_summary?: string; created_at: string }> }>>(`/api/trips/${encodeURIComponent(tripId)}/versions`, { signal }),
  renameTrip: (tripId: string, name: string) => request<ApiEnvelope<{ trip: Trip }>>(`/api/trips/${encodeURIComponent(tripId)}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  updateTripItinerary: (tripId: string, itineraryItems: Trip["itinerary_items"], changeSummary: string) => request<ApiEnvelope<{ trip: Trip }>>(`/api/trips/${encodeURIComponent(tripId)}`, { method: "PATCH", body: JSON.stringify({ itinerary_items: itineraryItems, change_summary: changeSummary }) }),
  deleteTrip: (tripId: string) => request<ApiEnvelope<{ trip_id: string }>>(`/api/trips/${encodeURIComponent(tripId)}`, { method: "DELETE" }),
  createTrip: (payload: TripRequest & { request_id: string }, signal?: AbortSignal) =>
    request<ApiEnvelope<{ trip: Trip }>>("/api/trips", { method: "POST", body: JSON.stringify(payload), signal }),
  discover: (payload: Record<string, unknown>, signal?: AbortSignal) =>
    request<ApiEnvelope<{ destinations: Destination[]; scout_summary?: string; progress?: unknown[]; warnings?: string[] }>>("/api/discover", { method: "POST", body: JSON.stringify(payload), signal }),
  replan: (payload: Record<string, unknown>, signal?: AbortSignal) =>
    request<ReplanResponse>("/api/trips/replan", { method: "POST", body: JSON.stringify(payload), signal }),
  select: (tripId: string, providerType: "hotel" | "cab" | "flight", option: unknown, tripContext: unknown, signal?: AbortSignal) =>
    request<ApiEnvelope<{ sandbox_booking?: BookingResult; selection?: unknown; itinerary_update?: unknown; trip?: Trip | null }>>(
      `/api/trips/${encodeURIComponent(tripId)}/selections`,
      { method: "POST", body: JSON.stringify({ trip_id: tripId, provider_type: providerType, option, trip_context: tripContext }), signal },
    ),
  wallet: (signal?: AbortSignal) => request<Wallet>("/api/sandbox/wallet", { signal }),
  topUp: (amountMinor: number, idempotencyKey: string) =>
    request<ApiEnvelope<{ wallet: Wallet }>>("/api/sandbox/wallet/topups", { method: "POST", body: JSON.stringify({ amount_minor: amountMinor, idempotency_key: idempotencyKey }) }),
  payment: (paymentId: string, signal?: AbortSignal) => request<Payment>(`/api/sandbox/payments/${encodeURIComponent(paymentId)}`, { signal }),
  diagnostics: (signal?: AbortSignal) => request<Record<string, unknown>>("/api/diagnostics", { signal }),
  health: (signal?: AbortSignal) => request<Record<string, unknown>>("/health", { signal }),
  legacyTravel: (message: string, threadId?: string, signal?: AbortSignal) =>
    request<ApiEnvelope<{ thread_id?: string; answer?: string; itinerary?: unknown[]; flight_results?: unknown[]; hotel_results?: unknown[]; llm_calls?: number }>>("/api/travel", {
      method: "POST", body: JSON.stringify({ message, thread_id: threadId }), signal,
    }),
};


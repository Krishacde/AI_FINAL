export type ProgressItem = { label?: string; step?: string; status?: string };
export type TripMessage = { role: "user" | "assistant" | "system" | string; content: string; created_at: string };

export type TripRequest = {
  planning_mode: "known" | "discover";
  destination: string | null;
  selected_destinations: string[];
  origin: string;
  start_date: string;
  end_date: string;
  travelers: number;
  traveler_type: string;
  budget: number | null;
  currency: string;
  interests: string[];
  pace: "relaxed" | "balanced" | "fast";
  accommodation: string;
  special_requirements: string | null;
  thread_id?: string | null;
};

export type Activity = {
  date?: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  location?: string;
  description?: string;
  reason?: string;
  estimated_cost?: number | null;
  cost?: number | null;
  cost_status?: string;
  status?: string;
  booking_id?: string;
  document_id?: string;
  is_flight_entry?: boolean;
  is_hotel_entry?: boolean;
  is_cab_entry?: boolean;
  [key: string]: unknown;
};

export type Quote = {
  quote_id: string;
  provider?: string;
  quote_type: string;
  currency: string;
  amount_minor: number;
  nightly_rate_minor?: number;
  nights?: number;
  rooms?: number;
  travelers?: number;
  check_in?: string;
  check_out?: string;
  travel_date?: string;
  route?: string;
  expires_at?: string;
};

export type TravelOption = {
  name?: string;
  airline?: string;
  flight_number?: string;
  area?: string;
  route?: string;
  location?: string;
  rating?: string;
  amenities?: string;
  booking_url?: string;
  price?: string;
  price_num?: number;
  price_note?: string;
  total_price?: string;
  total_num?: number;
  nightly_price?: string;
  vehicle?: string;
  duration?: string;
  departure?: string;
  arrival?: string;
  stops?: string;
  cabin?: string;
  status?: string;
  quote?: Quote;
  [key: string]: unknown;
};

export type PaymentDocument = Record<string, unknown>;

export type Payment = {
  payment_id?: string;
  transaction_id?: string;
  booking_id?: string;
  status?: string;
  booking_status?: string;
  amount_minor?: number;
  currency?: string;
  items?: Array<{ category: string; name: string; amount_minor: number }>;
  documents?: Record<string, PaymentDocument>;
  [key: string]: unknown;
};

export type BookingResult = {
  success: boolean;
  status?: string;
  booking_status?: string;
  booking_id?: string;
  payment_id?: string;
  transaction_id?: string;
  amount_minor?: number;
  error?: string;
  progress?: ProgressItem[];
  payment?: Payment | null;
  selected_hotel?: TravelOption;
};

export type Trip = {
  trip_id: string;
  name?: string;
  current_version?: number;
  created_at?: string;
  updated_at?: string;
  thread_id?: string;
  request: TripRequest;
  selected_destination?: string;
  itinerary?: Activity[];
  itinerary_items?: Activity[];
  flights?: TravelOption[];
  hotels?: TravelOption[];
  cabs?: TravelOption[];
  warnings?: string[];
  progress?: ProgressItem[];
  budget_breakdown?: Record<string, unknown>;
  recommendations?: string[];
  travel_insights?: Record<string, string[] | string | null>;
  sandbox_bookings?: BookingResult[];
  demo_booking?: BookingResult | null;
  [key: string]: unknown;
};

export type Destination = {
  name: string;
  region?: string;
  match_score?: number;
  why_visit?: string;
  special_this_month?: string | null;
  special_is_verified?: boolean;
  best_for?: string[];
  travel_time?: string;
  estimated_budget?: string | null;
  key_attractions?: string[];
  weather_summary?: string | null;
  source?: string | null;
  source_url?: string | null;
  status?: string;
};

export type Wallet = {
  wallet_id: string;
  name: string;
  currency: string;
  available_minor: number;
  reserved_minor: number;
  total_minor: number;
};

export type ReplanResponse = {
  success: boolean;
  itinerary?: Activity[];
  updated_hotels?: TravelOption[];
  hotel_search_performed?: boolean;
  change_summary?: string;
  affected_elements?: string[];
  error?: string;
  trip?: Trip;
};

export type EventStatus = "draft" | "published" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "cancelled";

export interface EventRecord {
  id: string;
  owner_id: string;
  organization_id: string | null;
  title: string;
  slug: string;
  event_type: string;
  description: string | null;
  city: string;
  location: string | null;
  start_date: string;
  end_date: string;
  schedule: string | null;
  age_range: string | null;
  price: number;
  capacity: number;
  payment_mode: string;
  status: EventStatus;
  social_copy: string | null;
  whatsapp_message: string | null;
  created_from: "telegram" | "web";
  created_at: string;
  updated_at: string;
  event_mode?: "simple" | "advanced";
  organizer_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

export interface EventProgram {
  id: string;
  event_id: string;
  name: string;
  turn: "morning" | "afternoon" | "full_day" | "custom";
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  min_age: number | null;
  max_age: number | null;
  capacity: number;
  payment_timing: "immediate" | "reserve" | "deferred";
  payment_due_date: string | null;
  included_items: string[];
  active: boolean;
  position: number;
}

export interface EventPeriod {
  id: string;
  event_id: string;
  label: string;
  start_date: string;
  end_date: string;
  active: boolean;
  position: number;
}

export interface EventPrice {
  id: string;
  event_id: string;
  program_id: string;
  period_id: string | null;
  label: string;
  audience: "all" | "member" | "non_member";
  amount: number;
  active: boolean;
  position: number;
}

export interface RegistrationRecord {
  id: string;
  event_id: string;
  participant_name: string;
  participant_email: string | null;
  participant_phone: string | null;
  participant_age: number | null;
  notes: string | null;
  payment_status: PaymentStatus;
  created_at: string;
  registration_status?: "requested" | "confirmed" | "cancelled";
  participant_birth_date?: string | null;
  guardian_name?: string | null;
  club_member?: boolean | null;
  current_club?: string | null;
  shirt_size?: string | null;
  allergies?: string | null;
  medical_notes?: string | null;
  image_consent?: boolean;
  registration_items?: Array<{
    amount: number;
    event_programs?: { name: string } | null;
    event_periods?: { label: string } | null;
    event_prices?: { label: string } | null;
  }>;
}

export interface ParsedEvent {
  intent: "create_event" | "list_events" | "help" | "unknown";
  event: Partial<Pick<EventRecord, "title" | "event_type" | "description" | "city" | "location" | "start_date" | "end_date" | "schedule" | "age_range" | "price" | "capacity" | "event_mode" | "organizer_name" | "contact_email" | "contact_phone">>;
  missing_fields: string[];
  social_copy: string;
  whatsapp_message: string;
  event_mode?: "simple" | "advanced";
  advanced?: AdvancedEventDraft;
}

export interface AdvancedEventDraft {
  programs: Array<{
    name: string;
    turn?: "morning" | "afternoon" | "full_day" | "custom";
    description?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    min_age?: number | null;
    max_age?: number | null;
    capacity?: number | null;
    payment_timing?: "immediate" | "reserve" | "deferred";
    payment_due_date?: string | null;
    included_items?: string[];
  }>;
  periods: Array<{ label: string; start_date: string; end_date: string }>;
  prices: Array<{
    program_name: string;
    period_label?: string | null;
    label: string;
    audience: "all" | "member" | "non_member";
    amount: number;
  }>;
  uncertainties: string[];
}

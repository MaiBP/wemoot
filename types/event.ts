export type EventStatus = "draft" | "published" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "cancelled";
export type EventComplexity = "simple" | "complex";

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
  location_id?: string | null;
  complexity?: EventComplexity;
  currency?: string;
  general_settings?: Record<string, unknown>;
  cancellation_policy?: string | null;
  cover_image_url?: string | null;
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
  slug?: string | null;
  category?: string | null;
  shift?: "morning" | "afternoon" | "full_day" | "custom" | null;
  min_birth_year?: number | null;
  max_birth_year?: number | null;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  sort_order?: number;
  updated_at?: string;
}

export interface EventPeriod {
  id: string;
  event_id: string;
  label: string;
  start_date: string;
  end_date: string;
  active: boolean;
  position: number;
  name?: string;
  is_active?: boolean;
  sort_order?: number;
}

export interface EventProgramPeriod {
  id: string;
  program_id: string;
  period_id: string;
  capacity: number | null;
  registered_count: number;
  reserved_count: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface CapacityReservation {
  id: string;
  event_id: string;
  program_id: string;
  period_id: string;
  registration_id: string;
  quantity: number;
  status: "reserved" | "confirmed" | "expired" | "cancelled";
  expires_at: string;
  stripe_session_id: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
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

export type ParticipantType =
  "general" | "member" | "non_member" | "player" | "goalkeeper" | "custom";

export type PricingType =
  | "fixed"
  | "per_period"
  | "period_bundle"
  | "full_event"
  | "early_bird"
  | "manual";

export interface EventPriceRule {
  id: string;
  event_id: string;
  program_id: string | null;
  period_id: string | null;
  participant_type: ParticipantType;
  pricing_type: PricingType;
  quantity_from: number | null;
  quantity_to: number | null;
  amount: number | string;
  currency: string;
  label: string | null;
  description: string | null;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  legacy_price_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DiscountType =
  "percentage" | "fixed_amount" | "full_event" | "bundle" | "manual";

export interface EventDiscount {
  id: string;
  event_id: string;
  program_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number | string;
  applies_to: "event" | "program";
  min_periods: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  usage_count: number;
  priority: number;
  is_combinable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type RegistrationFieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "boolean"
  | "file"
  | "signature"
  | "address"
  | "country"
  | "province"
  | "postal_code"
  | "image"
  | "heading"
  | "legal_text";

export interface RegistrationFormRecord {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  template_key: string | null;
  requires_account: boolean;
  allow_guest_registration: boolean;
  status: "draft" | "published" | "archived";
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RegistrationFormSection {
  id: string;
  form_id: string;
  title: string;
  description: string | null;
  section_key: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface RegistrationFormField {
  id: string;
  form_id: string;
  section_id: string | null;
  field_key: string;
  label: string;
  description: string | null;
  placeholder: string | null;
  field_type: RegistrationFieldType;
  required: boolean;
  options: Array<string | { label: string; value: string }>;
  validation_rules: Record<string, unknown>;
  conditional_logic: Record<string, unknown>;
  default_value: unknown;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface EventIncludedItem {
  id: string;
  event_id: string;
  program_id: string | null;
  name: string;
  description: string | null;
  requires_size: boolean;
  is_optional: boolean;
  created_at: string;
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
  registration_status?:
    "pending" | "pending_payment" | "requested" | "confirmed" | "cancelled";
  participant_birth_date?: string | null;
  guardian_name?: string | null;
  club_member?: boolean | null;
  current_club?: string | null;
  shirt_size?: string | null;
  allergies?: string | null;
  medical_notes?: string | null;
  image_consent?: boolean;
  program_id?: string | null;
  participant_type?: ParticipantType;
  total_amount?: number | null;
  currency?: string;
  event_programs?: { name: string } | null;
  registration_periods?: Array<{ event_periods?: { label: string } | null }>;
  registration_items?: Array<{
    amount: number;
    event_programs?: { name: string } | null;
    event_periods?: { label: string } | null;
    event_prices?: { label: string } | null;
  }>;
}

export interface ParsedEvent {
  intent: "create_event" | "list_events" | "help" | "unknown";
  event: Partial<
    Pick<
      EventRecord,
      | "title"
      | "event_type"
      | "description"
      | "city"
      | "location"
      | "start_date"
      | "end_date"
      | "schedule"
      | "age_range"
      | "price"
      | "capacity"
      | "event_mode"
      | "organizer_name"
      | "contact_email"
      | "contact_phone"
      | "location_id"
    >
  >;
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
    pricing_type?: PricingType;
    quantity_from?: number | null;
    quantity_to?: number | null;
  }>;
  uncertainties: string[];
}

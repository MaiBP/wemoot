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
}

export interface ParsedEvent {
  intent: "create_event" | "list_events" | "help" | "unknown";
  event: Partial<Pick<EventRecord, "title" | "event_type" | "description" | "city" | "location" | "start_date" | "end_date" | "schedule" | "age_range" | "price" | "capacity">>;
  missing_fields: string[];
  social_copy: string;
  whatsapp_message: string;
}


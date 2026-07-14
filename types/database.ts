export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: { Row: { id: string; full_name: string | null; email: string | null; role: string | null; city: string | null; language: string; created_at: string }; Insert: { id: string; full_name?: string | null; email?: string | null; role?: string | null; city?: string | null; language?: string }; Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]> };
      events: { Row: import("./event").EventRecord; Insert: Omit<import("./event").EventRecord, "id" | "created_at" | "updated_at"> & { id?: string }; Update: Partial<Database["public"]["Tables"]["events"]["Insert"]> };
      registrations: { Row: import("./event").RegistrationRecord; Insert: Omit<import("./event").RegistrationRecord, "id" | "created_at"> & { id?: string }; Update: Partial<Database["public"]["Tables"]["registrations"]["Insert"]> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}


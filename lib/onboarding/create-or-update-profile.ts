import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileType } from "@/lib/onboarding/schema";

export interface ProfileOnboardingInput {
  profile_type?: ProfileType;
  full_name?: string;
  email?: string;
  phone?: string | null;
  city?: string;
  country?: string;
  language?: "es" | "en";
  timezone?: string;
  professional_name?: string | null;
  current_club?: string | null;
  specialty?: string | null;
}

export async function createOrUpdateProfile(
  client: SupabaseClient,
  profileId: string,
  input: ProfileOnboardingInput,
) {
  const { data, error } = await client
    .from("profiles")
    .update({ ...input, onboarding_status: "in_progress" })
    .eq("id", profileId)
    .select(
      "id,full_name,email,phone,city,country,language,timezone,profile_type,professional_name,current_club,specialty,onboarding_status,onboarding_completed_at",
    )
    .single();
  if (error) throw error;
  return data;
}

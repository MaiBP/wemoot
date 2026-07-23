import type { SupabaseClient } from "@supabase/supabase-js";
import { getOnboardingStatus } from "@/lib/onboarding/get-onboarding-status";
import {
  profileNeedsOrganization,
  type ProfileType,
} from "@/lib/onboarding/schema";

export class OnboardingError extends Error {}

export async function completeOnboarding(
  client: SupabaseClient,
  profileId: string,
) {
  const status = await getOnboardingStatus(client, profileId);
  const profileType = status.profile.profile_type as ProfileType | null;
  if (!profileType)
    throw new OnboardingError("Selecciona cómo utilizarás WeMoot");
  if (
    !status.profile.full_name ||
    !status.profile.email ||
    !status.profile.city
  )
    throw new OnboardingError("Completa nombre, email y ciudad");
  if (profileNeedsOrganization(profileType) && !status.organization?.name)
    throw new OnboardingError("Añade el nombre de tu organización");
  const completedAt = new Date().toISOString();
  const { data, error } = await client
    .from("profiles")
    .update({
      onboarding_status: "completed",
      onboarding_completed_at: completedAt,
    })
    .eq("id", profileId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

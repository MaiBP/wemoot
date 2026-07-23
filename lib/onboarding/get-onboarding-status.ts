import type { SupabaseClient } from "@supabase/supabase-js";

export async function getOnboardingStatus(
  client: SupabaseClient,
  profileId: string,
) {
  const [{ data: profile, error }, { data: organizations = [] }] =
    await Promise.all([
      client
        .from("profiles")
        .select(
          "id,full_name,email,phone,city,country,language,timezone,profile_type,professional_name,current_club,specialty,onboarding_status,onboarding_completed_at",
        )
        .eq("id", profileId)
        .single(),
      client
        .from("organizations")
        .select("*")
        .eq("owner_id", profileId)
        .order("created_at")
        .limit(1),
    ]);
  if (error) throw error;
  const organization = organizations?.[0] ?? null;
  let locationsQuery = client
    .from("organization_locations")
    .select("*")
    .eq("owner_id", profileId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (organization)
    locationsQuery = locationsQuery.eq("organization_id", organization.id);
  const { data: locations = [], error: locationsError } = await locationsQuery;
  if (locationsError) throw locationsError;
  return {
    profile,
    organization,
    locations: locations ?? [],
    defaultLocation: locations?.find((location) => location.is_default) ?? null,
    completed: profile.onboarding_status === "completed",
  };
}

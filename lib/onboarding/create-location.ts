import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { onboardingLocationSchema } from "@/lib/onboarding/schema";

export async function createLocation(
  client: SupabaseClient,
  profileId: string,
  input: z.infer<typeof onboardingLocationSchema>,
) {
  if (input.is_default) {
    let defaults = client
      .from("organization_locations")
      .update({ is_default: false })
      .eq("owner_id", profileId)
      .eq("is_default", true);
    defaults = input.organization_id
      ? defaults.eq("organization_id", input.organization_id)
      : defaults.is("organization_id", null);
    const { error } = await defaults;
    if (error) throw error;
  }
  const values = {
    organization_id: input.organization_id ?? null,
    owner_id: profileId,
    name: input.name,
    location_type: input.location_type,
    address_line_1: input.address_line_1 ?? null,
    address_line_2: input.address_line_2 ?? null,
    city: input.city ?? null,
    province: input.province ?? null,
    postal_code: input.postal_code ?? null,
    country: input.country ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    google_maps_url: input.google_maps_url ?? null,
    contact_name: input.contact_name ?? null,
    contact_phone: input.contact_phone ?? null,
    is_default: input.is_default,
    is_active: true,
  };
  const query = input.id
    ? client
        .from("organization_locations")
        .update(values)
        .eq("id", input.id)
        .eq("owner_id", profileId)
    : client.from("organization_locations").insert(values);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

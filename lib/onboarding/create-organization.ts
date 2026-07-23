import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { onboardingOrganizationSchema } from "@/lib/onboarding/schema";

export async function createOrganization(
  client: SupabaseClient,
  profileId: string,
  input: z.infer<typeof onboardingOrganizationSchema>,
) {
  const { data: existing } = await client
    .from("organizations")
    .select("id")
    .eq("owner_id", profileId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const values = {
    owner_id: profileId,
    name: input.name,
    type: input.type,
    contact_email: input.contact_email ?? null,
    contact_phone: input.contact_phone ?? null,
    website_url: input.website_url ?? null,
    instagram_url: input.instagram_url ?? null,
    tax_id: input.tax_id ?? null,
    address_line_1: input.address_line_1 ?? null,
    address_line_2: input.address_line_2 ?? null,
    city: input.city ?? null,
    province: input.province ?? null,
    postal_code: input.postal_code ?? null,
    country: input.country ?? null,
  };
  const query = existing
    ? client.from("organizations").update(values).eq("id", existing.id)
    : client.from("organizations").insert(values);
  const { data: organization, error } = await query.select("*").single();
  if (error) throw error;
  const { error: membershipError } = await client
    .from("organization_members")
    .upsert(
      {
        organization_id: organization.id,
        profile_id: profileId,
        role: "owner",
        status: "active",
      },
      { onConflict: "organization_id,profile_id" },
    );
  if (membershipError) throw membershipError;
  return organization;
}

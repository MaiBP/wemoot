import { z } from "zod";

export const profileTypes = [
  "club",
  "academy",
  "coach",
  "sports_organizer",
  "event_company",
  "other",
] as const;

export type ProfileType = (typeof profileTypes)[number];

export const profileTypeLabels: Record<ProfileType, string> = {
  club: "Club",
  academy: "Academia",
  coach: "Entrenador",
  sports_organizer: "Organizador deportivo",
  event_company: "Empresa de eventos",
  other: "Otro",
};

export const profileTypeStepSchema = z.object({
  profile_type: z.enum(profileTypes),
});

export const personalDataSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.email(),
  phone: z.string().trim().max(30).nullable().optional(),
  city: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(80).default("España"),
  language: z.enum(["es", "en"]).default("es"),
  timezone: z.string().trim().min(3).max(80).default("Europe/Madrid"),
  professional_name: z.string().trim().max(120).nullable().optional(),
  current_club: z.string().trim().max(120).nullable().optional(),
  specialty: z.string().trim().max(120).nullable().optional(),
});

export const profileProgressSchema = z
  .object({
    profile_type: z.enum(profileTypes).optional(),
    full_name: z.string().trim().min(2).max(120).optional(),
    email: z.email().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    city: z.string().trim().min(2).max(100).optional(),
    country: z.string().trim().min(2).max(80).optional(),
    language: z.enum(["es", "en"]).optional(),
    timezone: z.string().trim().min(3).max(80).optional(),
    professional_name: z.string().trim().max(120).nullable().optional(),
    current_club: z.string().trim().max(120).nullable().optional(),
    specialty: z.string().trim().max(120).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No hay cambios");

export const onboardingOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.string().trim().min(2).max(60),
  contact_email: z.email().nullable().optional(),
  contact_phone: z.string().trim().max(30).nullable().optional(),
  website_url: z.url().nullable().optional(),
  instagram_url: z.url().nullable().optional(),
  tax_id: z.string().trim().max(30).nullable().optional(),
  address_line_1: z.string().trim().max(200).nullable().optional(),
  address_line_2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  province: z.string().trim().max(100).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
});

export const onboardingLocationSchema = z.object({
  id: z.uuid().optional(),
  organization_id: z.uuid().nullable().optional(),
  name: z.string().trim().min(2).max(160),
  location_type: z
    .enum([
      "sports_facility",
      "office",
      "meeting_room",
      "external_venue",
      "online",
      "other",
    ])
    .default("sports_facility"),
  address_line_1: z.string().trim().max(200).nullable().optional(),
  address_line_2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  province: z.string().trim().max(100).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  google_maps_url: z.url().nullable().optional(),
  contact_name: z.string().trim().max(120).nullable().optional(),
  contact_phone: z.string().trim().max(30).nullable().optional(),
  is_default: z.boolean().default(true),
});

export function profileNeedsOrganization(type: ProfileType | null | undefined) {
  return type === "club" || type === "academy" || type === "event_company";
}

import type { ProfileType } from "@/lib/onboarding/schema";

const telegramProfileTypeLabels: Record<ProfileType, string> = {
  club: "Club",
  academy: "Academia",
  coach: "Entrenador",
  sports_organizer: "Organizador deportivo",
  event_company: "Empresa de eventos",
  other: "Otro",
};

export const telegramProfileTypeKeyboard = [
  ["Club", "Academia"],
  ["Entrenador", "Organizador deportivo"],
  ["Empresa de eventos", "Otro"],
];

export function isTelegramOnboardingFlow(flow: unknown) {
  return typeof flow === "string" && flow.startsWith("profile_onboarding_");
}

export function parseTelegramProfileType(value: string): ProfileType | null {
  const normalized = value.trim().toLocaleLowerCase("es");
  const entries = Object.entries(telegramProfileTypeLabels) as Array<
    [ProfileType, string]
  >;
  return (
    entries.find(
      ([, label]) => label.toLocaleLowerCase("es") === normalized,
    )?.[0] ?? null
  );
}

export function telegramOnboardingSummary(data: Record<string, unknown>) {
  const type = data.profile_type as ProfileType | undefined;
  return [
    "Tu perfil está listo para revisar:",
    "",
    data.full_name ? `👤 ${data.full_name}` : null,
    type ? `⚽ ${telegramProfileTypeLabels[type]}` : null,
    data.organization_name ? `🏢 ${data.organization_name}` : null,
    data.location_name ? `📍 ${data.location_name}` : null,
    data.city ? `🌍 ${data.city}` : null,
    "",
    "Usaré estos datos como predeterminados al crear eventos.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

import assert from "node:assert/strict";
import test from "node:test";
import { buildEventDefaults } from "../lib/onboarding/event-defaults.ts";
import {
  profileNeedsOrganization,
  profileProgressSchema,
} from "../lib/onboarding/schema.ts";
import {
  isTelegramOnboardingFlow,
  parseTelegramProfileType,
  telegramOnboardingSummary,
} from "../lib/onboarding/telegram-onboarding.ts";

test("club, academy and event company require an organization", () => {
  assert.equal(profileNeedsOrganization("club"), true);
  assert.equal(profileNeedsOrganization("academy"), true);
  assert.equal(profileNeedsOrganization("event_company"), true);
  assert.equal(profileNeedsOrganization("coach"), false);
});

test("profile progress validates partial steps", () => {
  assert.equal(
    profileProgressSchema.safeParse({ profile_type: "coach" }).success,
    true,
  );
  assert.equal(
    profileProgressSchema.safeParse({ email: "not-an-email" }).success,
    false,
  );
  assert.equal(profileProgressSchema.safeParse({}).success, false);
});

test("Telegram recognizes onboarding choices and state", () => {
  assert.equal(
    parseTelegramProfileType("Organizador deportivo"),
    "sports_organizer",
  );
  assert.equal(parseTelegramProfileType("desconocido"), null);
  assert.equal(isTelegramOnboardingFlow("profile_onboarding_city"), true);
  assert.equal(isTelegramOnboardingFlow("creating_event"), false);
});

test("event defaults prefer organization and default location", () => {
  assert.deepEqual(
    buildEventDefaults({
      profile: {
        full_name: "Ana",
        email: "ana@example.com",
        phone: "1",
        city: "Madrid",
      },
      organization: {
        id: "org",
        name: "Club Norte",
        contact_email: "club@example.com",
      },
      defaultLocation: { id: "loc", name: "Campo Norte", city: "Alcobendas" },
    }),
    {
      organizer_name: "Club Norte",
      contact_email: "club@example.com",
      contact_phone: "1",
      city: "Alcobendas",
      location: "Campo Norte",
      location_id: "loc",
      organization_id: "org",
    },
  );
});

test("Telegram summary includes reusable defaults", () => {
  const summary = telegramOnboardingSummary({
    profile_type: "coach",
    full_name: "Ana Pérez",
    city: "Madrid",
    location_name: "Campo Norte",
  });
  assert.match(summary, /Entrenador/);
  assert.match(summary, /Campo Norte/);
});

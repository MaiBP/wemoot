import assert from "node:assert/strict";
import test from "node:test";
import {
  dynamicRegistrationSchema,
  preregistrationSettingsSchema,
} from "../lib/validations.ts";
import {
  calculateInvitationExpiry,
  summarizePreregistrations,
} from "../lib/preregistration/domain.ts";

const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

test("acepta varias modalidades con periodos independientes", () => {
  const result = dynamicRegistrationSchema.safeParse({
    event_id: uuid(1),
    form_id: uuid(2),
    selections: [
      { program_id: uuid(3), period_ids: [uuid(4)] },
      { program_id: uuid(5), period_ids: [uuid(4), uuid(6)] },
    ],
    participant_type: "general",
    payment_method: "card",
    answers: {},
  });
  assert.equal(result.success, true);
});

test("rechaza una modalidad repetida", () => {
  const result = dynamicRegistrationSchema.safeParse({
    event_id: uuid(1),
    form_id: uuid(2),
    selections: [
      { program_id: uuid(3), period_ids: [uuid(4)] },
      { program_id: uuid(3), period_ids: [uuid(5)] },
    ],
    participant_type: "general",
    payment_method: "card",
    answers: {},
  });
  assert.equal(result.success, false);
});

test("limita la invitación de pago a un máximo de 24 horas", () => {
  assert.equal(
    preregistrationSettingsSchema.safeParse({
      registration_mode: "preregistration",
      allow_multiple_programs: "true",
      preregistration_limit: 70,
      payment_invitation_hours: 24,
    }).success,
    true,
  );
  assert.equal(
    preregistrationSettingsSchema.safeParse({
      registration_mode: "preregistration",
      allow_multiple_programs: "true",
      preregistration_limit: 70,
      payment_invitation_hours: 25,
    }).success,
    false,
  );
  assert.equal(
    calculateInvitationExpiry(
      new Date("2026-05-14T18:00:00Z"),
      24,
    ).toISOString(),
    "2026-05-15T18:00:00.000Z",
  );
});

test("resume la cola sin exponer participantes", () => {
  assert.deepEqual(
    summarizePreregistrations([
      { queue_position: 1, registration_status: "confirmed" },
      { queue_position: 2, registration_status: "payment_invited" },
      { queue_position: 3, registration_status: "waitlisted" },
      { queue_position: 4, registration_status: "expired" },
      { queue_position: null, registration_status: "confirmed" },
    ]),
    { total: 4, waiting: 1, invited: 1, confirmed: 1, expired: 1 },
  );
});

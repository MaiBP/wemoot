import assert from "node:assert/strict";
import test from "node:test";
import {
  validateParticipant,
  validateRequiredAnswers,
  withoutSensitiveAnswers,
} from "../lib/forms/validate-registration.ts";
import { eventCreationSchema } from "../lib/validations.ts";
import { generatePeriods } from "../lib/events/generate-periods.ts";

const baseEvent = {
  title: "Campus de verano",
  event_type: "Campus",
  city: "Barcelona",
  start_date: "2026-06-22",
  end_date: "2026-07-31",
};

test("un evento básico exige precio y plazas", () => {
  assert.equal(
    eventCreationSchema.safeParse({
      ...baseEvent,
      event_mode: "simple",
      programs: [],
      periods: [],
    }).success,
    false,
  );
});

test("un evento avanzado acepta modalidades y periodos sin precio general", () => {
  const result = eventCreationSchema.safeParse({
    ...baseEvent,
    event_mode: "advanced",
    programs: [
      {
        name: "Perfeccionamiento mañana",
        category: "Alevín",
        turn: "morning",
        start_time: "09:00",
        end_time: "14:00",
        min_age: 8,
        max_age: 11,
        capacity: 40,
      },
    ],
    periods: [
      {
        label: "Semana 1",
        start_date: "2026-06-22",
        end_date: "2026-06-26",
      },
    ],
    period_unit: "weekly",
    initial_prices: [
      {
        program_index: 0,
        member_amount: 60,
        non_member_amount: 70,
        full_member_amount: 350,
        full_non_member_amount: 400,
      },
    ],
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.price, undefined);
    assert.equal(result.data.programs[0]?.capacity, 40);
    assert.equal(result.data.programs[0]?.category, "Alevín");
    assert.equal(result.data.programs[0]?.min_age, 8);
    assert.equal(result.data.programs[0]?.max_age, 11);
    assert.equal(result.data.initial_prices[0]?.full_member_amount, 350);
  }
});

test("genera periodos diarios, semanales y mensuales", () => {
  assert.equal(
    generatePeriods("daily", "2026-08-03", "2026-08-05").length,
    3,
  );
  assert.deepEqual(
    generatePeriods("weekly", "2026-08-03", "2026-08-14").map((period) => [
      period.start_date,
      period.end_date,
    ]),
    [
      ["2026-08-03", "2026-08-09"],
      ["2026-08-10", "2026-08-14"],
    ],
  );
  assert.equal(
    generatePeriods("monthly", "2026-08-15", "2026-10-02").length,
    3,
  );
});

test("un evento avanzado rechaza un rango de edades invertido", () => {
  const result = eventCreationSchema.safeParse({
    ...baseEvent,
    event_mode: "advanced",
    programs: [
      {
        name: "Tecnificación",
        turn: "afternoon",
        min_age: 15,
        max_age: 10,
        capacity: 20,
      },
    ],
    periods: [
      {
        label: "Semana 1",
        start_date: "2026-06-22",
        end_date: "2026-06-26",
      },
    ],
  });
  assert.equal(result.success, false);
});

test("rechaza un campo obligatorio vacío", () => {
  const errors = validateRequiredAnswers(
    [
      {
        field_key: "name",
        label: "Nombre",
        field_type: "text",
        required: true,
      },
    ],
    {},
  );
  assert.equal(errors.length, 1);
});

test("sólo exige un campo condicional cuando corresponde", () => {
  const fields = [
    {
      field_key: "allergies",
      label: "Alergias",
      field_type: "textarea",
      required: true,
      conditional_logic: { field: "has_allergies", equals: true },
    },
  ];
  assert.equal(
    validateRequiredAnswers(fields, { has_allergies: false }).length,
    0,
  );
  assert.equal(
    validateRequiredAnswers(fields, { has_allergies: true }).length,
    1,
  );
});

test("rechaza una edad fuera del programa", () => {
  const result = validateParticipant({
    birthDate: "2022-01-01",
    eventDate: "2026-06-22",
    guardianName: "Tutor",
    minAge: 6,
    maxAge: 16,
  });
  assert.match(result.errors[0] ?? "", /edad/i);
});

test("exige tutor para un menor", () => {
  const result = validateParticipant({
    birthDate: "2014-01-01",
    eventDate: "2026-06-22",
    guardianName: "",
    minAge: 6,
    maxAge: 16,
  });
  assert.match(result.errors[0] ?? "", /tutor/i);
});

test("un consentimiento obligatorio debe estar aceptado", () => {
  const errors = validateRequiredAnswers(
    [
      {
        field_key: "terms",
        label: "Condiciones",
        field_type: "boolean",
        required: true,
      },
    ],
    { terms: false },
  );
  assert.equal(errors.length, 1);
});

test("las respuestas médicas se excluyen de vistas no sensibles", () => {
  const fields = [
    {
      field_key: "allergies",
      label: "Alergias",
      field_type: "textarea",
      required: false,
      section_key: "medical",
    },
    {
      field_key: "club",
      label: "Club",
      field_type: "text",
      required: false,
      section_key: "sports",
    },
  ];
  assert.deepEqual(
    withoutSensitiveAnswers(fields, {
      allergies: "Dato privado",
      club: "WeMoot FC",
    }),
    { club: "WeMoot FC" },
  );
});

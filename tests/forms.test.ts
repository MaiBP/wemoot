import assert from "node:assert/strict";
import test from "node:test";
import {
  validateParticipant,
  validateRequiredAnswers,
  withoutSensitiveAnswers,
} from "../lib/forms/validate-registration.ts";

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

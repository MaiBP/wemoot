import test from "node:test";
import assert from "node:assert/strict";
import {
  expandInterpretedPrices,
  generateWeeklyPeriods,
  getAdvancedDraft,
  handleComplexFlowStep,
  shouldUseComplexFlow,
} from "../lib/telegram/complex-event-flow.ts";

const baseEvent = {
  title: "Campus de Tecnificación Verano",
  event_type: "campus",
  description: null,
  city: "Barcelona",
  location: null,
  start_date: "2026-06-22",
  end_date: "2026-07-31",
  schedule: null,
  age_range: null,
  price: null,
  capacity: null,
  organizer_name: null,
  contact_email: null,
  contact_phone: null,
};

const collected = {
  ...baseEvent,
  event_mode: "advanced",
  advanced: { programs: [], periods: [], prices: [], uncertainties: [] },
};

test("detecta la creación de un evento complejo", () => {
  assert.equal(shouldUseComplexFlow(collected), true);
});

test("añade un programa mediante pasos validados", () => {
  let result = handleComplexFlowStep(
    "complex_menu",
    "Crear programas",
    collected,
  );
  result = handleComplexFlowStep(
    "complex_program_name",
    "Perfeccionamiento",
    result.collected,
  );
  result = handleComplexFlowStep(
    "complex_program_turn",
    "Mañana",
    result.collected,
  );
  result = handleComplexFlowStep(
    "complex_program_schedule",
    "de 9 a 14",
    result.collected,
  );
  result = handleComplexFlowStep(
    "complex_program_ages",
    "de 6 a 16 años",
    result.collected,
  );
  result = handleComplexFlowStep(
    "complex_program_capacity",
    "40",
    result.collected,
  );
  const program = getAdvancedDraft(result.collected).programs[0];
  assert.equal(program.name, "Perfeccionamiento");
  assert.equal(program.turn, "morning");
  assert.equal(program.start_time, "09:00");
  assert.equal(program.max_age, 16);
  assert.equal(program.capacity, 40);
});

test("genera automáticamente las semanas del campus", () => {
  const periods = generateWeeklyPeriods("2026-06-22", "2026-07-31");
  assert.equal(periods.length, 6);
  assert.deepEqual(periods[0], {
    label: "Semana 1",
    start_date: "2026-06-22",
    end_date: "2026-06-26",
  });
  assert.equal(periods.at(-1)?.end_date, "2026-07-31");
});

test("normaliza precios interpretados y los aplica a cada programa", () => {
  const interpreted = expandInterpretedPrices(
    [
      {
        program_name: null,
        label: "2 semanas socio",
        audience: "member",
        amount: 130,
        pricing_type: "period_bundle",
        quantity_from: 2,
        quantity_to: 2,
      },
    ],
    ["Perfeccionamiento", "Élite Pro"],
  );
  assert.equal(interpreted.prices.length, 2);
  assert.equal(interpreted.prices[0].quantity_from, 2);
  assert.deepEqual(
    interpreted.prices.map((price) => price.program_name),
    ["Perfeccionamiento", "Élite Pro"],
  );
});

test("elige la plantilla Campus completo", () => {
  const result = handleComplexFlowStep(
    "complex_form_template",
    "Campus completo",
    collected,
  );
  assert.equal(result.collected.registration_template, "football_campus_full");
  assert.equal(result.flow, "complex_menu");
});

test("solicita confirmación antes de guardar el borrador", () => {
  const result = handleComplexFlowStep(
    "complex_menu",
    "Guardar borrador",
    collected,
  );
  assert.equal(result.flow, "awaiting_confirmation");
  assert.equal(result.action, "prepare_save");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  expandInterpretedPrices,
  generateWeeklyPeriods,
  getAdvancedDraft,
  handleComplexFlowStep,
  complexSummary,
  detectedEventSummary,
  eventCompletionMessage,
  pricingPreview,
  requiresDashboardPublication,
  shouldUseComplexFlow,
} from "../lib/telegram/complex-event-flow.ts";
import { getTelegramImageReference } from "../lib/telegram.ts";

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

test("muestra las fechas del periodo en la regla de precio", () => {
  const preview = pricingPreview(
    [
      {
        program_name: "Tecnificación",
        period_label: "Semana 1",
        label: "Tarifa semana 1",
        audience: "all",
        amount: 90,
        pricing_type: "fixed",
        quantity_from: null,
        quantity_to: null,
      },
    ],
    [
      {
        label: "Semana 1",
        start_date: "2026-06-22",
        end_date: "2026-06-26",
      },
    ],
  );
  assert.match(preview, /Periodo del 22 al 26 de junio/);
  assert.match(preview, /90 €/);
});

test("muestra ambos meses cuando el periodo cruza de mes", () => {
  const preview = pricingPreview(
    [
      {
        program_name: "Campus",
        period_label: "Semana especial",
        label: "Tarifa especial",
        audience: "member",
        amount: 120,
        pricing_type: "fixed",
        quantity_from: null,
        quantity_to: null,
      },
    ],
    [
      {
        label: "Semana especial",
        start_date: "2026-06-29",
        end_date: "2026-07-03",
      },
    ],
  );
  assert.match(preview, /29 de junio al 3 de julio/);
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

test("configura modalidades combinables y preinscripción desde Telegram", () => {
  let result = handleComplexFlowStep(
    "complex_menu",
    "Configurar inscripciones",
    collected,
  );
  assert.equal(result.flow, "complex_program_selection_mode");
  result = handleComplexFlowStep(
    "complex_program_selection_mode",
    "Varias modalidades",
    result.collected,
  );
  result = handleComplexFlowStep(
    "complex_registration_mode",
    "Preinscripción y lista de espera",
    result.collected,
  );
  result = handleComplexFlowStep(
    "complex_preregistration_limit",
    "70",
    result.collected,
  );
  result = handleComplexFlowStep(
    "complex_payment_invitation_hours",
    "24 horas",
    result.collected,
  );
  assert.equal(result.flow, "complex_menu");
  assert.equal(result.collected.allow_multiple_programs, true);
  assert.equal(result.collected.registration_mode, "preregistration");
  assert.equal(result.collected.preregistration_limit, 70);
  assert.equal(result.collected.payment_invitation_hours, 24);
  assert.match(complexSummary(result.collected), /máximo 70 · 24 h/);
});

test("permite configurar inscripción directa para una modalidad", () => {
  const selection = handleComplexFlowStep(
    "complex_program_selection_mode",
    "Una modalidad",
    collected,
  );
  const direct = handleComplexFlowStep(
    "complex_registration_mode",
    "Inscripción directa",
    selection.collected,
  );
  assert.equal(direct.collected.allow_multiple_programs, false);
  assert.equal(direct.collected.registration_mode, "direct");
});

test("inicia el asistente guiado con imágenes", () => {
  const result = handleComplexFlowStep(
    "event_creation_method",
    "🖼️ Enviar imágenes",
    collected,
  );
  assert.equal(result.flow, "event_creation_images");
  assert.equal(result.collected.guided_creation, true);
  assert.match(result.message, /varias imágenes seguidas/i);
  assert.match(result.message, /nítidas/i);
  assert.deepEqual(result.keyboard?.[0], ["🔎 Analizar imágenes"]);
});

test("guarda la referencia de la imagen sin descargarla ni analizarla", () => {
  const reference = getTelegramImageReference({
    message_id: 10,
    chat: { id: 20 },
    caption: "Tarifas del campus",
    photo: [
      { file_id: "small", width: 100, height: 100 },
      { file_id: "large", width: 1200, height: 1200, file_size: 500000 },
    ],
  });
  assert.deepEqual(reference, {
    fileId: "large",
    fileSize: 500000,
    mimeType: "image/jpeg",
    fileName: "cartel.jpg",
    caption: "Tarifas del campus",
  });
});

test("muestra un resumen estructurado de lo detectado", () => {
  const summary = detectedEventSummary({
    ...collected,
    advanced: {
      programs: [
        {
          name: "Tecnificación",
          turn: "morning",
          start_time: "09:00",
          end_time: "14:00",
          min_age: 8,
          max_age: 14,
          capacity: null,
          payment_timing: "immediate",
          included_items: [],
        },
      ],
      periods: [
        {
          label: "Semana 1",
          start_date: "2026-06-22",
          end_date: "2026-06-26",
        },
      ],
      prices: [],
      uncertainties: [],
    },
  });
  assert.match(summary, /EVENTO/);
  assert.match(summary, /PROGRAMAS Y TURNOS/);
  assert.match(summary, /Tecnificación/);
  assert.match(summary, /Semana 1/);
});

test("el flujo guiado pregunta aforo, inscripción y formulario", () => {
  const guided = {
    ...collected,
    guided_creation: true,
    advanced: {
      programs: [
        {
          name: "Mañana",
          turn: "morning" as const,
          capacity: null,
          payment_timing: "immediate" as const,
          included_items: [],
        },
      ],
      periods: [
        {
          label: "Semana 1",
          start_date: "2026-06-22",
          end_date: "2026-06-26",
        },
        {
          label: "Semana 2",
          start_date: "2026-06-29",
          end_date: "2026-07-03",
        },
      ],
      prices: [],
      uncertainties: [],
    },
  };
  let result = handleComplexFlowStep(
    "event_creation_detected_confirmation",
    "✅ Sí, continuar",
    guided,
  );
  assert.equal(result.flow, "guided_program_capacity");
  result = handleComplexFlowStep(
    "guided_program_capacity",
    "40",
    result.collected,
  );
  assert.equal(result.flow, "complex_program_selection_mode");
  result = handleComplexFlowStep(
    "complex_program_selection_mode",
    "Varias modalidades",
    result.collected,
  );
  assert.equal(result.flow, "guided_period_selection");
  result = handleComplexFlowStep(
    "guided_period_selection",
    "Sí, cada semana",
    result.collected,
  );
  assert.equal(result.flow, "guided_full_event_discount");
  result = handleComplexFlowStep(
    "guided_full_event_discount",
    "No",
    result.collected,
  );
  result = handleComplexFlowStep(
    "complex_registration_mode",
    "Inscripción directa",
    result.collected,
  );
  assert.equal(result.flow, "complex_form_template");
  result = handleComplexFlowStep(
    "complex_form_template",
    "⚽ Campus completo",
    result.collected,
  );
  assert.equal(result.flow, "guided_form_review");
  result = handleComplexFlowStep(
    "guided_form_review",
    "✅ Está bien",
    result.collected,
  );
  assert.equal(result.flow, "guided_final_review");
  result = handleComplexFlowStep(
    "guided_final_review",
    "🚀 Publicar",
    result.collected,
  );
  assert.equal(result.flow, "awaiting_confirmation");
  assert.equal(result.collected.telegram_save_mode, "publish");
});

test("configura semanas individuales y descuento de campus completo", () => {
  let result = handleComplexFlowStep(
    "guided_period_selection",
    "Solo campus completo",
    { ...collected, guided_creation: true },
  );
  assert.equal(result.collected.allow_individual_periods, false);
  result = handleComplexFlowStep(
    "guided_full_event_discount",
    "Sí, añadir descuento",
    result.collected,
  );
  result = handleComplexFlowStep(
    "guided_full_event_discount_value",
    "20%",
    result.collected,
  );
  assert.equal(result.flow, "complex_registration_mode");
  assert.equal(result.collected.full_event_discount_percentage, 20);
});

test("permite corregir y eliminar modalidades antes de continuar", () => {
  const editable = {
    ...collected,
    guided_creation: true,
    advanced: {
      programs: [
        {
          name: "Mañana",
          turn: "morning" as const,
          start_time: "09:00",
          end_time: "14:00",
          min_age: 6,
          max_age: 14,
          capacity: 30,
          payment_timing: "immediate" as const,
          included_items: [],
        },
        {
          name: "Tarde",
          turn: "afternoon" as const,
          capacity: 20,
          payment_timing: "immediate" as const,
          included_items: [],
        },
      ],
      periods: [],
      prices: [
        {
          program_name: "Mañana",
          period_label: null,
          label: "Tarifa mañana",
          audience: "all" as const,
          amount: 100,
          pricing_type: "fixed" as const,
          quantity_from: null,
          quantity_to: null,
        },
        {
          program_name: "Tarde",
          period_label: null,
          label: "Tarifa tarde",
          audience: "all" as const,
          amount: 80,
          pricing_type: "fixed" as const,
          quantity_from: null,
          quantity_to: null,
        },
      ],
      uncertainties: [],
    },
  };
  let result = handleComplexFlowStep(
    "event_creation_detected_confirmation",
    "⚽ Editar modalidades",
    editable,
  );
  assert.equal(result.flow, "guided_program_edit_select");
  result = handleComplexFlowStep(
    "guided_program_edit_select",
    "1. Mañana",
    result.collected,
  );
  result = handleComplexFlowStep(
    "guided_program_edit_menu",
    "Nombre",
    result.collected,
  );
  result = handleComplexFlowStep(
    "guided_program_edit_name",
    "Tecnificación",
    result.collected,
  );
  assert.equal(
    getAdvancedDraft(result.collected).programs[0].name,
    "Tecnificación",
  );
  assert.equal(
    getAdvancedDraft(result.collected).prices[0].program_name,
    "Tecnificación",
  );

  result = handleComplexFlowStep(
    "guided_program_edit_select",
    "1. Tecnificación",
    result.collected,
  );
  result = handleComplexFlowStep(
    "guided_program_edit_menu",
    "Plazas",
    result.collected,
  );
  result = handleComplexFlowStep(
    "guided_program_edit_capacity",
    "40",
    result.collected,
  );
  assert.equal(getAdvancedDraft(result.collected).programs[0].capacity, 40);

  result = handleComplexFlowStep(
    "guided_program_edit_select",
    "2. Tarde",
    result.collected,
  );
  result = handleComplexFlowStep(
    "guided_program_edit_menu",
    "🗑️ Eliminar modalidad",
    result.collected,
  );
  result = handleComplexFlowStep(
    "guided_program_delete_confirmation",
    "Sí, eliminar",
    result.collected,
  );
  assert.equal(getAdvancedDraft(result.collected).programs.length, 1);
  assert.equal(getAdvancedDraft(result.collected).prices.length, 1);
  assert.equal(result.flow, "guided_program_edit_select");
});

test("obliga a publicar eventos complejos desde el dashboard", () => {
  const complex = {
    ...collected,
    guided_creation: true,
    registration_template: "football_campus_full",
    advanced: {
      programs: ["Mañana", "Tarde", "Porteros"].map((name) => ({
        name,
        turn: "custom" as const,
        capacity: 20,
        payment_timing: "immediate" as const,
        included_items: [],
      })),
      periods: [
        {
          label: "Semana 1",
          start_date: "2026-06-22",
          end_date: "2026-06-26",
        },
      ],
      prices: [],
      uncertainties: [],
    },
  };
  assert.equal(requiresDashboardPublication(complex), true);
  let result = handleComplexFlowStep(
    "guided_form_review",
    "✅ Está bien",
    complex,
  );
  assert.equal(result.flow, "guided_final_review");
  assert.doesNotMatch(result.keyboard?.flat().join(" ") ?? "", /🚀 Publicar/);
  assert.match(result.message, /publicarlo desde el dashboard/i);

  result = handleComplexFlowStep(
    "guided_final_review",
    "🚀 Publicar",
    result.collected,
  );
  assert.equal(result.flow, "guided_final_review");
  assert.equal(result.action, undefined);

  result = handleComplexFlowStep(
    "guided_final_review",
    "👀 Guardar y revisar dashboard",
    result.collected,
  );
  assert.equal(result.flow, "awaiting_confirmation");
  assert.equal(result.collected.telegram_save_mode, "draft");
});

test("permite publicar desde Telegram con hasta dos modalidades y periodos", () => {
  const simple = {
    ...collected,
    advanced: {
      programs: ["Mañana", "Tarde"].map((name) => ({
        name,
        turn: "custom" as const,
        capacity: 20,
        payment_timing: "immediate" as const,
        included_items: [],
      })),
      periods: [
        {
          label: "Turno 1",
          start_date: "2026-06-22",
          end_date: "2026-06-26",
        },
        {
          label: "Turno 2",
          start_date: "2026-06-29",
          end_date: "2026-07-03",
        },
      ],
      prices: [],
      uncertainties: [],
    },
  };
  assert.equal(requiresDashboardPublication(simple), false);
});

test("cierra un evento publicado con enlaces y acciones útiles", () => {
  const completion = eventCompletionMessage({
    collected: { ...collected, title: "Campus de verano" },
    eventId: "event-123",
    slug: "campus-verano",
    appUrl: "https://wemoot.com/",
    savedAsDraft: false,
    dashboardPublicationRequired: false,
  });
  assert.match(completion.message, /Evento publicado correctamente/);
  assert.match(
    completion.message,
    /https:\/\/wemoot\.com\/events\/campus-verano\/register/,
  );
  assert.deepEqual(completion.keyboard[0], ["Crear otro evento"]);
  assert.deepEqual(completion.keyboard[1], ["Mis eventos", "Ver dashboard"]);
});

test("cierra un evento complejo indicando la revisión obligatoria", () => {
  const completion = eventCompletionMessage({
    collected: { ...collected, title: "Campus avanzado" },
    eventId: "event-456",
    slug: "campus-avanzado",
    appUrl: "https://wemoot.com",
    savedAsDraft: true,
    dashboardPublicationRequired: true,
  });
  assert.match(completion.message, /quedó preparado como borrador/);
  assert.match(completion.message, /publicación se realiza desde allí/);
  assert.match(
    completion.message,
    /https:\/\/wemoot\.com\/dashboard\/events\/event-456/,
  );
  assert.deepEqual(completion.keyboard[0], ["Ver dashboard"]);
});

import type { AdvancedEventDraft } from "@/types/event";
import type { RegistrationTemplateKey } from "@/lib/forms/create-registration-template";
import {
  generatePeriods,
  type PeriodUnit,
} from "../events/generate-periods.ts";
import { formatPeriodDateRange } from "../period-format.ts";

export type ComplexFlowName =
  | "event_creation_type"
  | "event_creation_method"
  | "event_creation_description"
  | "event_creation_images"
  | "event_creation_detected_confirmation"
  | "basic_event_review"
  | "event_creation_copy"
  | "guided_program_capacity"
  | "guided_program_edit_select"
  | "guided_program_edit_menu"
  | "guided_program_edit_name"
  | "guided_program_edit_turn"
  | "guided_program_edit_schedule"
  | "guided_program_edit_ages"
  | "guided_program_edit_capacity"
  | "guided_program_delete_confirmation"
  | "guided_period_type"
  | "guided_period_selection"
  | "guided_full_event_discount"
  | "guided_full_event_discount_value"
  | "guided_form_review"
  | "guided_final_review"
  | "complex_menu"
  | "complex_program_name"
  | "complex_program_turn"
  | "complex_program_schedule"
  | "complex_program_ages"
  | "complex_program_capacity"
  | "complex_period_mode"
  | "complex_period_label"
  | "complex_period_dates"
  | "complex_pricing_input"
  | "complex_pricing_confirmation"
  | "complex_form_template"
  | "complex_program_selection_mode"
  | "complex_registration_mode"
  | "complex_preregistration_limit"
  | "complex_payment_invitation_hours"
  | "complex_import";

export interface ComplexFlowResult {
  flow: ComplexFlowName | "awaiting_confirmation";
  collected: Record<string, unknown>;
  message: string;
  keyboard?: string[][];
  action?:
    | "parse_pricing"
    | "import"
    | "import_guided"
    | "list_previous_events"
    | "copy_event"
    | "prepare_save"
    | "save_draft";
}

export const eventCreationMethodKeyboard = [
  ["📝 Describir el evento"],
  ["🖼️ Enviar imágenes"],
  ["📂 Copiar evento anterior"],
  ["Cancelar"],
];

export const eventCreationTypeKeyboard = [
  ["Evento básico", "Evento avanzado"],
  ["No estoy seguro"],
  ["Cancelar"],
];

export const detectedEventKeyboard = [
  ["✅ Sí, continuar"],
  ["⚽ Editar modalidades"],
  ["✏️ Corregir otros datos"],
  ["❌ Empezar de nuevo"],
];

export const complexMenuKeyboard = [
  ["Crear programas", "Configurar periodos"],
  ["Configurar precios", "Configurar inscripciones"],
  ["Elegir formulario", "Importar información"],
  ["Ver resumen"],
  ["Guardar borrador", "Cancelar"],
];

const complexFlows = new Set<ComplexFlowName>([
  "event_creation_type",
  "event_creation_method",
  "event_creation_description",
  "event_creation_images",
  "event_creation_detected_confirmation",
  "basic_event_review",
  "event_creation_copy",
  "guided_program_capacity",
  "guided_program_edit_select",
  "guided_program_edit_menu",
  "guided_program_edit_name",
  "guided_program_edit_turn",
  "guided_program_edit_schedule",
  "guided_program_edit_ages",
  "guided_program_edit_capacity",
  "guided_program_delete_confirmation",
  "guided_period_type",
  "guided_period_selection",
  "guided_full_event_discount",
  "guided_full_event_discount_value",
  "guided_form_review",
  "guided_final_review",
  "complex_menu",
  "complex_program_name",
  "complex_program_turn",
  "complex_program_schedule",
  "complex_program_ages",
  "complex_program_capacity",
  "complex_period_mode",
  "complex_period_label",
  "complex_period_dates",
  "complex_pricing_input",
  "complex_pricing_confirmation",
  "complex_form_template",
  "complex_program_selection_mode",
  "complex_registration_mode",
  "complex_preregistration_limit",
  "complex_payment_invitation_hours",
  "complex_import",
]);

export function isComplexFlowName(value: unknown): value is ComplexFlowName {
  return (
    typeof value === "string" && complexFlows.has(value as ComplexFlowName)
  );
}

export function normalizeTelegramChoice(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, "")
    .trim();
}

export function getAdvancedDraft(
  collected: Record<string, unknown>,
): AdvancedEventDraft {
  const value = collected.advanced as Partial<AdvancedEventDraft> | undefined;
  return {
    programs: Array.isArray(value?.programs) ? value.programs : [],
    periods: Array.isArray(value?.periods) ? value.periods : [],
    prices: Array.isArray(value?.prices) ? value.prices : [],
    uncertainties: Array.isArray(value?.uncertainties)
      ? value.uncertainties
      : [],
  };
}

export function shouldUseComplexFlow(collected: Record<string, unknown>) {
  const advanced = getAdvancedDraft(collected);
  return (
    collected.event_mode === "advanced" ||
    advanced.programs.length > 0 ||
    advanced.periods.length > 1 ||
    advanced.prices.length > 1
  );
}

export function requiresDashboardPublication(
  collected: Record<string, unknown>,
) {
  return shouldUseComplexFlow(collected);
}

interface InterpretedPrice {
  program_name: string | null;
  label: string;
  audience: "all" | "member" | "non_member";
  amount: number;
  pricing_type:
    | "fixed"
    | "per_period"
    | "period_bundle"
    | "full_event"
    | "early_bird"
    | "manual";
  quantity_from: number | null;
  quantity_to: number | null;
}

export function expandInterpretedPrices(
  prices: InterpretedPrice[],
  programNames: string[],
  initialUncertainties: string[] = [],
) {
  const knownPrograms = new Map(
    programNames.map((name) => [normalizeTelegramChoice(name), name]),
  );
  const uncertainties = [...initialUncertainties];
  const expanded = prices.flatMap((price) => {
    const targets = price.program_name
      ? [knownPrograms.get(normalizeTelegramChoice(price.program_name))]
      : programNames;
    const validTargets = targets.filter((name): name is string =>
      Boolean(name),
    );
    if (!validTargets.length) {
      uncertainties.push(
        `No existe el programa indicado: ${price.program_name ?? "sin programa"}`,
      );
      return [];
    }
    return validTargets.map((program_name) => ({
      program_name,
      period_label: null,
      label: price.label,
      audience: price.audience,
      amount: price.amount,
      pricing_type: price.pricing_type,
      quantity_from: price.quantity_from,
      quantity_to: price.quantity_to,
    }));
  });
  return { prices: expanded, uncertainties };
}

export function generateWeeklyPeriods(startDate: string, endDate: string) {
  return generatePeriods("period_weekly", startDate, endDate, 5);
}

function configuredPeriods(
  unit: PeriodUnit,
  collected: Record<string, unknown>,
  weeklyDays = 5,
) {
  return generatePeriods(
    unit,
    String(collected.start_date ?? ""),
    String(collected.end_date ?? ""),
    weeklyDays,
  );
}

function periodConfiguration(choice: string): {
  unit: PeriodUnit;
  weeklyDays: number;
  label: string;
} | null {
  if (choice === "dias individuales")
    return { unit: "daily", weeklyDays: 7, label: "días individuales" };
  if (choice === "meses")
    return { unit: "monthly", weeklyDays: 7, label: "bloques mensuales" };
  const weeklyDays = Number(choice.match(/semanas de ([567]) dias/)?.[1]);
  return weeklyDays
    ? {
        unit: "period_weekly",
        weeklyDays,
        label: `semanas de ${weeklyDays} días`,
      }
    : null;
}

export function parseTimeRange(value: string) {
  const match = value.match(
    /(?:de\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:h(?:oras?)?)?\s*(?:a|hasta|[-–])\s*(\d{1,2})(?::(\d{2}))?/i,
  );
  if (!match) return null;
  const startHour = Number(match[1]);
  const startMinute = Number(match[2] ?? 0);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4] ?? 0);
  if (
    startHour > 23 ||
    endHour > 23 ||
    startMinute > 59 ||
    endMinute > 59 ||
    endHour * 60 + endMinute <= startHour * 60 + startMinute
  )
    return null;
  const format = (hour: number, minute: number) =>
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    start_time: format(startHour, startMinute),
    end_time: format(endHour, endMinute),
  };
}

export function parseAgeRange(value: string) {
  const match = value.match(
    /(?:de\s*)?(\d{1,3})\s*(?:a|hasta|[-–])\s*(\d{1,3})/i,
  );
  if (!match) return null;
  const min_age = Number(match[1]);
  const max_age = Number(match[2]);
  if (min_age < 3 || max_age > 100 || max_age < min_age) return null;
  return { min_age, max_age };
}

export function parsePeriodDates(value: string) {
  const match = value.match(
    /(\d{4}-\d{2}-\d{2})\s*(?:a|al|hasta|[-–])\s*(\d{4}-\d{2}-\d{2})/i,
  );
  if (!match || match[2] < match[1]) return null;
  return { start_date: match[1], end_date: match[2] };
}

export function applyNaturalProgramCorrection(
  collected: Record<string, unknown>,
  text: string,
) {
  const advanced = getAdvancedDraft(collected);
  const normalizedText = normalizeTelegramChoice(text);
  const matches = advanced.programs
    .map((program, index) => ({
      index,
      normalizedName: normalizeTelegramChoice(program.name),
    }))
    .filter(({ normalizedName }) => normalizedText.includes(normalizedName))
    .sort(
      (left, right) => right.normalizedName.length - left.normalizedName.length,
    );
  if (!matches.length) return null;

  const schedule = parseTimeRange(text);
  const turn = /\btarde\b/i.test(normalizedText)
    ? ("afternoon" as const)
    : /\bmanana\b/i.test(normalizedText)
      ? ("morning" as const)
      : null;
  if (!schedule && !turn) return null;

  const programs = advanced.programs.map((program, index) =>
    index === matches[0].index
      ? {
          ...program,
          ...(turn ? { turn } : {}),
          ...(schedule ?? {}),
        }
      : program,
  );
  return {
    ...collected,
    advanced: { ...advanced, programs },
  };
}

export function complexSummary(collected: Record<string, unknown>) {
  const advanced = getAdvancedDraft(collected);
  const template = collected.registration_template as
    RegistrationTemplateKey | undefined;
  const templateName =
    template === "football_campus_full"
      ? "Campus completo"
      : template === "basic"
        ? "Formulario básico"
        : template === "blank"
          ? "Personalizado"
          : "Sin elegir";
  const multiplePrograms =
    collected.allow_multiple_programs === false
      ? "Solo una por participante"
      : "Una o varias por participante";
  const registration =
    collected.registration_mode === "preregistration"
      ? `Preinscripción · máximo ${String(collected.preregistration_limit ?? "sin definir")} · ${String(collected.payment_invitation_hours ?? 24)} h para pagar`
      : "Inscripción y pago directo";
  const periodConfigurationName =
    collected.telegram_period_unit === "daily"
      ? "días individuales"
      : collected.telegram_period_unit === "monthly"
        ? "meses"
        : collected.telegram_period_unit === "period_weekly"
          ? `semanas de ${String(collected.telegram_weekly_days ?? 5)} días`
          : "periodos importados o manuales";
  const periods = collected.telegram_periods_pending_dashboard
    ? "Pendientes de configurar en dashboard"
    : `${advanced.periods.length} (${periodConfigurationName})`;
  return `Resumen del evento avanzado:\n\n• ${String(collected.title ?? "Sin nombre")}\n• Modalidades: ${advanced.programs.length} (${multiplePrograms})\n• Periodos: ${periods}\n• Reglas de precio: ${advanced.prices.length}\n• Inscripciones: ${registration}\n• Formulario: ${templateName}`;
}

const turnName = (turn: AdvancedEventDraft["programs"][number]["turn"]) =>
  turn === "morning"
    ? "Mañana"
    : turn === "afternoon"
      ? "Tarde"
      : turn === "full_day"
        ? "Todo el día"
        : "Personalizado";

export function detectedEventSummary(collected: Record<string, unknown>) {
  const advanced = getAdvancedDraft(collected);
  const programs = advanced.programs.length
    ? advanced.programs
        .map((program) => {
          const schedule =
            program.start_time && program.end_time
              ? ` · ${program.start_time}-${program.end_time}`
              : "";
          const ages =
            program.min_age != null && program.max_age != null
              ? ` · ${program.min_age}-${program.max_age} años`
              : "";
          const capacity =
            program.capacity != null ? ` · ${program.capacity} plazas` : "";
          return `• ${program.name} · ${turnName(program.turn)}${schedule}${ages}${capacity}`;
        })
        .join("\n")
    : "• No detectados";
  const periods = advanced.periods.length
    ? advanced.periods
        .map(
          (period) =>
            `• ${period.label}: ${period.start_date} al ${period.end_date}`,
        )
        .join("\n")
    : `• ${String(collected.start_date ?? "Fecha pendiente")} al ${String(collected.end_date ?? "Fecha pendiente")}`;

  return `He organizado la información que recibí:

EVENTO
• ${String(collected.title ?? "Nombre pendiente")}
• ${String(collected.city ?? "Ciudad pendiente")}${collected.location ? ` · ${String(collected.location)}` : ""}
• ${String(collected.start_date ?? "Fecha pendiente")} al ${String(collected.end_date ?? "Fecha pendiente")}

PROGRAMAS Y TURNOS
${programs}

SEMANAS O PERIODOS
${periods}

PRECIOS
• ${advanced.prices.length ? `${advanced.prices.length} tarifas detectadas; te las mostraré para confirmarlas.` : "No detectados todavía."}

¿La información principal es correcta?`;
}

export function basicEventSummary(collected: Record<string, unknown>) {
  return `He organizado el evento básico:

• ${String(collected.title ?? "Nombre pendiente")}
• ${String(collected.event_type ?? "Tipo pendiente")}
• ${String(collected.start_date ?? "Fecha pendiente")} al ${String(collected.end_date ?? "Fecha pendiente")}
• ${String(collected.city ?? "Ciudad pendiente")}${collected.location ? ` · ${String(collected.location)}` : ""}
${collected.schedule ? `• Horario: ${String(collected.schedule)}\n` : ""}${collected.age_range ? `• Edades o categorías: ${String(collected.age_range)}\n` : ""}• Precio final: €${String(collected.price ?? "pendiente")}
• Plazas: ${String(collected.capacity ?? "pendiente")}

Un evento básico tiene una única actividad, un precio final y un aforo general.`;
}

function programEditor(
  collected: Record<string, unknown>,
  prefix = "",
): ComplexFlowResult {
  const programs = getAdvancedDraft(collected).programs;
  return {
    flow: "guided_program_edit_select",
    collected: {
      ...collected,
      telegram_edit_program_index: undefined,
      telegram_program_editor_mode: undefined,
    },
    message: `${prefix}${prefix ? "\n\n" : ""}${
      programs.length
        ? "Selecciona la modalidad que quieres corregir:"
        : "No hay modalidades configuradas."
    }`,
    keyboard: [
      ...programs.map((program, index) => [
        `${index + 1}. ${program.name}`.slice(0, 60),
      ]),
      ["➕ Añadir modalidad"],
      ["✅ Terminar edición"],
      ["Cancelar"],
    ],
  };
}

function editingProgram(
  collected: Record<string, unknown>,
): AdvancedEventDraft["programs"][number] | undefined {
  const index = Number(collected.telegram_edit_program_index);
  return getAdvancedDraft(collected).programs[index];
}

function updateEditingProgram(
  collected: Record<string, unknown>,
  changes: Partial<AdvancedEventDraft["programs"][number]>,
  confirmation: string,
) {
  const advanced = getAdvancedDraft(collected);
  const index = Number(collected.telegram_edit_program_index);
  if (!Number.isInteger(index) || !advanced.programs[index])
    return programEditor(collected, "No encontré esa modalidad.");
  const previous = advanced.programs[index];
  const programs = advanced.programs.map((program, position) =>
    position === index ? { ...program, ...changes } : program,
  );
  const prices = changes.name
    ? advanced.prices.map((price) =>
        normalizeTelegramChoice(price.program_name) ===
        normalizeTelegramChoice(previous.name)
          ? { ...price, program_name: changes.name! }
          : price,
      )
    : advanced.prices;
  return programEditor(
    { ...collected, advanced: { ...advanced, programs, prices } },
    confirmation,
  );
}

export function registrationFormPreview(template: RegistrationTemplateKey) {
  if (template === "basic")
    return `El formulario básico solicitará:
• Datos del participante
• Modalidad y periodos
• Datos de contacto
• Aceptación de condiciones`;
  if (template === "blank")
    return `Crearé un formulario vacío para que añadas los campos desde el dashboard.`;
  return `El formulario de campus solicitará:
• Datos del participante y tutor
• Modalidades y semanas
• Información médica y alergias
• Autorizaciones
• Contacto de emergencia
• Aceptación de condiciones`;
}

function nextGuidedConfiguration(
  collected: Record<string, unknown>,
): ComplexFlowResult {
  const advanced = getAdvancedDraft(collected);
  if (!advanced.programs.length)
    return {
      flow: "complex_program_name",
      collected,
      message:
        "No detecté ninguna modalidad. ¿Cómo se llama la primera? Por ejemplo: Tecnificación de mañana.",
    };
  if (advanced.programs.some((program) => !program.capacity))
    return {
      flow: "guided_program_capacity",
      collected,
      message:
        "¿Cuántas plazas tendrá cada modalidad? Si todas tienen el mismo aforo, responde solo con un número. También puedes escribir, por ejemplo: “Mañana 40, Tarde 30”.",
    };
  if (!advanced.periods.length)
    return {
      flow: "guided_period_type",
      collected,
      message:
        "¿Cómo quieres dividir las fechas de este evento? Esta será una configuración inicial; en el dashboard podrás definir una periodicidad distinta para cada modalidad.",
      keyboard: [
        ["Semanas de 5 días", "Semanas de 6 días"],
        ["Semanas de 7 días"],
        ["Días individuales", "Meses"],
        ["Configurar en dashboard"],
        ["Cancelar"],
      ],
    };
  return {
    flow: "complex_program_selection_mode",
    collected,
    message:
      "¿Cada participante puede elegir una sola modalidad o combinar varias, por ejemplo mañana y tarde?",
    keyboard: [["Una modalidad", "Varias modalidades"], ["Cancelar"]],
  };
}

const menu = (collected: Record<string, unknown>, prefix = "") => ({
  flow: "complex_menu" as const,
  collected,
  message: `${prefix}${prefix ? "\n\n" : ""}${complexSummary(collected)}\n\n¿Qué quieres configurar?`,
  keyboard: complexMenuKeyboard,
});

function finalReview(
  collected: Record<string, unknown>,
  prefix = "",
): ComplexFlowResult {
  const advanced = getAdvancedDraft(collected);
  const dashboardRequired = requiresDashboardPublication(collected);
  const complexityReasons = [
    advanced.programs.length > 2
      ? `${advanced.programs.length} modalidades`
      : null,
    advanced.periods.length > 2 ? `${advanced.periods.length} periodos` : null,
  ].filter((reason): reason is string => Boolean(reason));
  const complexityDescription = complexityReasons.length
    ? complexityReasons.join(" y ")
    : "una estructura avanzada";
  return {
    flow: "guided_final_review",
    collected,
    message: `${prefix}${prefix ? "\n\n" : ""}${complexSummary(collected)}

Todo está preparado. Los avisos a participantes se enviarán únicamente por correo.

${
  dashboardRequired
    ? `Este evento requiere revisión porque tiene ${complexityDescription}. Para evitar errores, debes comprobarlo y publicarlo desde el dashboard.`
    : "El evento es simple y puedes publicarlo ahora desde Telegram o revisarlo primero en el dashboard."
}`,
    keyboard: dashboardRequired
      ? [["👀 Guardar y revisar dashboard"], ["Cancelar"]]
      : [
          ["🚀 Publicar"],
          ["💾 Guardar borrador"],
          ["👀 Revisar dashboard"],
          ["Cancelar"],
        ],
  };
}

export function handleComplexFlowStep(
  flow: ComplexFlowName,
  text: string,
  collected: Record<string, unknown>,
): ComplexFlowResult {
  const choice = normalizeTelegramChoice(text);
  const advanced = getAdvancedDraft(collected);
  const scratch = (collected.telegram_program ?? {}) as Record<string, unknown>;
  if (choice === "menu" || choice === "volver") return menu(collected);
  if (
    choice === "volver a modalidades" &&
    flow.startsWith("guided_program_edit")
  )
    return programEditor(collected);

  if (flow === "event_creation_type") {
    const requestedMode = choice.includes("evento avanzado")
      ? "advanced"
      : choice.includes("evento basico")
        ? "simple"
        : choice.includes("no estoy seguro")
          ? "auto"
          : null;
    if (!requestedMode)
      return {
        flow,
        collected,
        message:
          "Elige Evento básico, Evento avanzado o No estoy seguro para que pueda orientarte.",
        keyboard: eventCreationTypeKeyboard,
      };
    return {
      flow: "event_creation_method",
      collected: {
        ...collected,
        telegram_event_type: requestedMode,
        ...(requestedMode === "auto" ? {} : { event_mode: requestedMode }),
        advanced: { programs: [], periods: [], prices: [], uncertainties: [] },
      },
      message:
        requestedMode === "simple"
          ? "Perfecto. Un evento básico tendrá una actividad, un precio final y un aforo general. ¿Cómo quieres facilitarme la información?"
          : requestedMode === "advanced"
            ? "Perfecto. Prepararemos la estructura inicial y la publicación se completará desde el dashboard. ¿Cómo quieres facilitarme la información?"
            : "Analizaré la información y te diré si corresponde a un evento básico o avanzado. ¿Cómo quieres facilitármela?",
      keyboard: eventCreationMethodKeyboard,
    };
  }

  if (flow === "event_creation_method") {
    if (choice.includes("describir el evento"))
      return {
        flow: "event_creation_description",
        collected: { ...collected, guided_creation: true },
        message:
          collected.telegram_event_type === "simple"
            ? "Descríbeme el evento en un solo mensaje. Incluye nombre, tipo, lugar, fechas, horario, edades o categorías, precio final y número total de plazas."
            : "Descríbeme el evento en un solo mensaje. Incluye todo lo que sepas: nombre, lugar, fechas, modalidades, horarios, edades, periodos, sesiones y precios.",
        keyboard: [["Cancelar"]],
      };
    if (
      choice.includes("enviar imagenes") ||
      choice.includes("enviar imágenes")
    )
      return {
        flow: "event_creation_images",
        collected: {
          ...collected,
          guided_creation: true,
          telegram_image_queue: [],
          telegram_attachment_count: 0,
        },
        message:
          "Puedes enviar varias imágenes seguidas. Procura que sean nítidas, estén bien iluminadas y muestren todo el texto sin recortes ni reflejos para minimizar errores. Las guardaré sin interrumpirte y, cuando hayas terminado, pulsa “Analizar imágenes”.",
        keyboard: [["🔎 Analizar imágenes"], ["Cancelar"]],
      };
    if (choice.includes("copiar evento anterior"))
      return {
        flow: "event_creation_copy",
        collected: { ...collected, guided_creation: true },
        action: "list_previous_events",
        message: "Voy a buscar tus eventos anteriores.",
      };
    return {
      flow,
      collected,
      message: "Elige cómo quieres crear el evento.",
      keyboard: eventCreationMethodKeyboard,
    };
  }

  if (flow === "event_creation_description")
    return {
      flow,
      collected,
      action: "import_guided",
      message: text,
    };

  if (flow === "event_creation_images") {
    if (
      choice.includes("analizar imagenes") ||
      choice.includes("analizar informacion")
    )
      return Number(collected.telegram_attachment_count ?? 0) > 0
        ? {
            flow: "event_creation_detected_confirmation",
            collected,
            message: detectedEventSummary(collected),
            keyboard: detectedEventKeyboard,
          }
        : {
            flow,
            collected,
            message:
              "Aún no recibí ninguna imagen. Envíame uno o varios carteles y después pulsa “Analizar imágenes”.",
            keyboard: [["🔎 Analizar imágenes"], ["Cancelar"]],
          };
    return {
      flow,
      collected,
      message:
        "Envíame otra imagen o pulsa “Analizar imágenes” cuando hayas terminado.",
      keyboard: [["🔎 Analizar imágenes"], ["Cancelar"]],
    };
  }

  if (flow === "event_creation_copy")
    return {
      flow,
      collected,
      action: "copy_event",
      message: text,
    };

  if (flow === "event_creation_detected_confirmation") {
    if (choice.includes("si, continuar") || choice.includes("sí, continuar")) {
      if (advanced.prices.length)
        return {
          flow: "complex_pricing_confirmation",
          collected: {
            ...collected,
            telegram_pending_prices: advanced.prices,
            advanced: { ...advanced, prices: [] },
          },
          message: `He interpretado estas tarifas:\n\n${pricingPreview(advanced.prices, advanced.periods)}\n\n¿Son correctas?`,
          keyboard: [["✅ Correcto", "✏️ Editar precios"], ["Cancelar"]],
        };
      return nextGuidedConfiguration(collected);
    }
    if (choice.includes("editar modalidades")) return programEditor(collected);
    if (
      choice.includes("corregir otros datos") ||
      choice.includes("corregir informacion")
    )
      return {
        flow: "event_creation_description",
        collected,
        message:
          "Indícame en un solo mensaje qué debo corregir o añadir. Conservaré el resto de la información.",
        keyboard: [["Cancelar"]],
      };
    if (choice.includes("empezar de nuevo"))
      return {
        flow: "event_creation_type",
        collected: {},
        message: "Empecemos de nuevo. ¿Qué tipo de evento quieres crear?",
        keyboard: eventCreationTypeKeyboard,
      };
    return {
      flow,
      collected,
      message: detectedEventSummary(collected),
      keyboard: detectedEventKeyboard,
    };
  }

  if (flow === "basic_event_review") {
    if (choice.includes("publicar"))
      return {
        flow: "awaiting_confirmation",
        collected: { ...collected, telegram_save_mode: "publish" },
        action: "prepare_save",
        message: `${basicEventSummary(collected)}\n\n¿Confirmas que quieres publicarlo ahora?`,
        keyboard: [["Confirmar publicación"], ["Cancelar"]],
      };
    if (choice.includes("guardar borrador"))
      return {
        flow: "awaiting_confirmation",
        collected: { ...collected, telegram_save_mode: "draft" },
        action: "save_draft",
        message: "Estoy guardando el evento como borrador.",
      };
    if (choice.includes("corregir"))
      return {
        flow: "event_creation_description",
        collected,
        message:
          "Indícame en un solo mensaje qué debo corregir o añadir. Conservaré el resto de la información.",
        keyboard: [["Cancelar"]],
      };
    return {
      flow,
      collected,
      message: `${basicEventSummary(collected)}\n\n¿Qué quieres hacer?`,
      keyboard: [
        ["🚀 Publicar", "💾 Guardar borrador"],
        ["✏️ Corregir datos"],
        ["Cancelar"],
      ],
    };
  }

  if (flow === "guided_program_edit_select") {
    if (choice.includes("anadir modalidad"))
      return {
        flow: "complex_program_name",
        collected: {
          ...collected,
          telegram_program: undefined,
          telegram_program_editor_mode: true,
        },
        message: "¿Cómo se llama la nueva modalidad?",
        keyboard: [["Cancelar"]],
      };
    if (choice.includes("terminar edicion"))
      return {
        flow: "event_creation_detected_confirmation",
        collected: {
          ...collected,
          telegram_edit_program_index: undefined,
          telegram_program_editor_mode: undefined,
        },
        message: detectedEventSummary(collected),
        keyboard: detectedEventKeyboard,
      };
    const selected = Number(choice.match(/^(\d+)\./)?.[1]) - 1;
    if (
      !Number.isInteger(selected) ||
      selected < 0 ||
      selected >= advanced.programs.length
    )
      return programEditor(collected, "No reconocí esa modalidad.");
    const program = advanced.programs[selected];
    return {
      flow: "guided_program_edit_menu",
      collected: { ...collected, telegram_edit_program_index: selected },
      message: `Editando “${program.name}”:

• Turno: ${turnName(program.turn)}
• Horario: ${program.start_time && program.end_time ? `${program.start_time}-${program.end_time}` : "Sin definir"}
• Edades: ${program.min_age != null && program.max_age != null ? `${program.min_age}-${program.max_age} años` : "Sin definir"}
• Plazas: ${program.capacity ?? "Sin definir"}

¿Qué quieres corregir?`,
      keyboard: [
        ["Nombre", "Turno"],
        ["Horario", "Edades"],
        ["Plazas"],
        ["🗑️ Eliminar modalidad"],
        ["Volver a modalidades"],
        ["Cancelar"],
      ],
    };
  }

  if (flow === "guided_program_edit_menu") {
    if (choice === "nombre")
      return {
        flow: "guided_program_edit_name",
        collected,
        message: "Escribe el nombre correcto de la modalidad.",
      };
    if (choice === "turno")
      return {
        flow: "guided_program_edit_turn",
        collected,
        message: "Selecciona el turno correcto.",
        keyboard: [
          ["Mañana", "Tarde"],
          ["Todo el día", "Personalizado"],
          ["Volver a modalidades"],
          ["Cancelar"],
        ],
      };
    if (choice === "horario")
      return {
        flow: "guided_program_edit_schedule",
        collected,
        message:
          "Indica el horario, por ejemplo “de 9:00 a 14:00”, o elige Sin horario.",
        keyboard: [["Sin horario"], ["Volver a modalidades"], ["Cancelar"]],
      };
    if (choice === "edades")
      return {
        flow: "guided_program_edit_ages",
        collected,
        message:
          "Indica las edades, por ejemplo “de 6 a 16 años”, o elige Todas las edades.",
        keyboard: [
          ["Todas las edades"],
          ["Volver a modalidades"],
          ["Cancelar"],
        ],
      };
    if (choice === "plazas")
      return {
        flow: "guided_program_edit_capacity",
        collected,
        message: "¿Cuántas plazas tendrá esta modalidad?",
      };
    if (choice.includes("eliminar modalidad")) {
      const program = editingProgram(collected);
      return {
        flow: "guided_program_delete_confirmation",
        collected,
        message: `¿Confirmas que quieres eliminar “${program?.name ?? "esta modalidad"}”?`,
        keyboard: [["Sí, eliminar"], ["No, conservar"], ["Cancelar"]],
      };
    }
    if (choice.includes("volver a modalidades"))
      return programEditor(collected);
    return {
      flow,
      collected,
      message: "Elige qué dato de la modalidad quieres corregir.",
      keyboard: [
        ["Nombre", "Turno"],
        ["Horario", "Edades"],
        ["Plazas"],
        ["🗑️ Eliminar modalidad"],
        ["Volver a modalidades"],
        ["Cancelar"],
      ],
    };
  }

  if (flow === "guided_program_edit_name") {
    const name = text.trim();
    if (name.length < 2 || name.length > 120)
      return {
        flow,
        collected,
        message: "Escribe un nombre de entre 2 y 120 caracteres.",
      };
    return updateEditingProgram(
      collected,
      { name },
      `Nombre actualizado a “${name}”.`,
    );
  }

  if (flow === "guided_program_edit_turn") {
    const turns: Record<
      string,
      AdvancedEventDraft["programs"][number]["turn"]
    > = {
      manana: "morning",
      tarde: "afternoon",
      "todo el dia": "full_day",
      personalizado: "custom",
    };
    const turn = turns[choice];
    if (!turn)
      return {
        flow,
        collected,
        message: "Elige Mañana, Tarde, Todo el día o Personalizado.",
      };
    return updateEditingProgram(
      collected,
      { turn },
      `Turno actualizado a ${turnName(turn)}.`,
    );
  }

  if (flow === "guided_program_edit_schedule") {
    if (choice === "sin horario")
      return updateEditingProgram(
        collected,
        { start_time: null, end_time: null },
        "Horario eliminado.",
      );
    const schedule = parseTimeRange(text);
    if (!schedule)
      return {
        flow,
        collected,
        message:
          "Indica un horario válido, por ejemplo “de 9:00 a 14:00”, o elige Sin horario.",
      };
    return updateEditingProgram(
      collected,
      schedule,
      `Horario actualizado a ${schedule.start_time}-${schedule.end_time}.`,
    );
  }

  if (flow === "guided_program_edit_ages") {
    if (choice === "todas las edades")
      return updateEditingProgram(
        collected,
        { min_age: null, max_age: null },
        "Eliminé la restricción de edad.",
      );
    const ages = parseAgeRange(text);
    if (!ages)
      return {
        flow,
        collected,
        message:
          "Indica un rango válido, por ejemplo “de 6 a 16 años”, o elige Todas las edades.",
      };
    return updateEditingProgram(
      collected,
      ages,
      `Edades actualizadas: ${ages.min_age}-${ages.max_age} años.`,
    );
  }

  if (flow === "guided_program_edit_capacity") {
    const capacity = Number(text.trim());
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000)
      return {
        flow,
        collected,
        message: "Indica un número de plazas entre 1 y 100000.",
      };
    return updateEditingProgram(
      collected,
      { capacity },
      `Plazas actualizadas a ${capacity}.`,
    );
  }

  if (flow === "guided_program_delete_confirmation") {
    if (choice === "si, eliminar") {
      const index = Number(collected.telegram_edit_program_index);
      const removed = advanced.programs[index];
      const programs = advanced.programs.filter(
        (_, position) => position !== index,
      );
      const prices = removed
        ? advanced.prices.filter(
            (price) =>
              normalizeTelegramChoice(price.program_name) !==
              normalizeTelegramChoice(removed.name),
          )
        : advanced.prices;
      return programEditor(
        { ...collected, advanced: { ...advanced, programs, prices } },
        "Modalidad eliminada.",
      );
    }
    if (choice === "no, conservar")
      return programEditor(collected, "No hice ningún cambio.");
    return {
      flow,
      collected,
      message: "Confirma si quieres eliminar la modalidad.",
      keyboard: [["Sí, eliminar"], ["No, conservar"], ["Cancelar"]],
    };
  }

  if (flow === "guided_program_capacity") {
    const numbers = [...text.matchAll(/(\d{1,6})/g)].map((match) =>
      Number(match[1]),
    );
    if (!numbers.length || numbers.some((value) => value < 1 || value > 100000))
      return {
        flow,
        collected,
        message:
          "Indica un número de plazas válido. Ejemplo: “40” o “Mañana 40, Tarde 30”.",
      };
    const programs = advanced.programs.map((program, index) => ({
      ...program,
      capacity:
        program.capacity ??
        (numbers.length === 1 ? numbers[0] : (numbers[index] ?? numbers[0])),
    }));
    return nextGuidedConfiguration({
      ...collected,
      advanced: { ...advanced, programs },
    });
  }

  if (flow === "guided_period_type") {
    if (choice === "configurar en dashboard")
      return {
        flow: "complex_program_selection_mode",
        collected: {
          ...collected,
          telegram_period_unit: undefined,
          telegram_weekly_days: undefined,
          telegram_periods_pending_dashboard: true,
        },
        message:
          "Dejaré los periodos pendientes para el dashboard. ¿Cada participante podrá elegir una sola modalidad o combinar varias?",
        keyboard: [["Una modalidad", "Varias modalidades"], ["Cancelar"]],
      };
    const configuration = periodConfiguration(choice);
    if (!configuration)
      return {
        flow,
        collected,
        message: "Elige cómo quieres dividir las fechas del evento.",
        keyboard: [
          ["Semanas de 5 días", "Semanas de 6 días"],
          ["Semanas de 7 días"],
          ["Días individuales", "Meses"],
          ["Configurar en dashboard"],
          ["Cancelar"],
        ],
      };
    const periods = configuredPeriods(
      configuration.unit,
      collected,
      configuration.weeklyDays,
    );
    if (!periods.length || periods.length > 52)
      return {
        flow,
        collected,
        message:
          "No pude generar entre 1 y 52 periodos con esas fechas. Revísalas o elige Configurar en dashboard.",
        keyboard: [["Configurar en dashboard"], ["Cancelar"]],
      };
    return {
      flow: "complex_program_selection_mode",
      collected: {
        ...collected,
        telegram_period_unit: configuration.unit,
        telegram_weekly_days: configuration.weeklyDays,
        telegram_periods_pending_dashboard: false,
        advanced: { ...advanced, periods },
      },
      message: `He creado ${periods.length} periodos como ${configuration.label}.\n\n¿Cada participante podrá elegir una sola modalidad o combinar varias?`,
      keyboard: [["Una modalidad", "Varias modalidades"], ["Cancelar"]],
    };
  }

  if (flow === "guided_period_selection") {
    const selectable =
      choice === "si, cada semana" || choice === "sí, cada semana"
        ? true
        : choice === "solo campus completo"
          ? false
          : null;
    if (selectable == null)
      return {
        flow,
        collected,
        message: "Elige si las semanas se pueden seleccionar por separado.",
        keyboard: [["Sí, cada semana"], ["Solo campus completo"], ["Cancelar"]],
      };
    return {
      flow: "guided_full_event_discount",
      collected: { ...collected, allow_individual_periods: selectable },
      message:
        "¿Quieres aplicar un descuento automático al elegir el campus completo?",
      keyboard: [["Sí, añadir descuento"], ["No"], ["Cancelar"]],
    };
  }

  if (flow === "guided_full_event_discount") {
    if (choice === "no")
      return {
        flow: "complex_registration_mode",
        collected: {
          ...collected,
          full_event_discount_percentage: undefined,
        },
        message: "¿Cómo quieres gestionar las inscripciones?",
        keyboard: [
          ["Inscripción directa"],
          ["Preinscripción y lista de espera"],
          ["Cancelar"],
        ],
      };
    if (choice.includes("anadir descuento"))
      return {
        flow: "guided_full_event_discount_value",
        collected,
        message:
          "¿Qué porcentaje de descuento tendrá el campus completo? Por ejemplo: 20%.",
      };
    return {
      flow,
      collected,
      message: "Elige si quieres aplicar un descuento al campus completo.",
      keyboard: [["Sí, añadir descuento"], ["No"], ["Cancelar"]],
    };
  }

  if (flow === "guided_full_event_discount_value") {
    const percentage = Number(
      text.match(/\d+(?:[.,]\d+)?/)?.[0].replace(",", "."),
    );
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100)
      return {
        flow,
        collected,
        message: "Indica un porcentaje mayor que 0 y menor o igual a 100.",
      };
    return {
      flow: "complex_registration_mode",
      collected: {
        ...collected,
        full_event_discount_percentage: percentage,
      },
      message: `Aplicaré un ${percentage}% al seleccionar todas las semanas.\n\n¿Cómo quieres gestionar las inscripciones?`,
      keyboard: [
        ["Inscripción directa"],
        ["Preinscripción y lista de espera"],
        ["Cancelar"],
      ],
    };
  }

  if (flow === "guided_form_review") {
    if (choice.includes("esta bien") || choice.includes("está bien"))
      return finalReview(collected);
    if (choice.includes("modificar"))
      return finalReview(
        { ...collected, telegram_review_form: true },
        "Guardaré el evento como borrador para que personalices el formulario en el dashboard.",
      );
    return {
      flow,
      collected,
      message: "Confirma el formulario o elige modificarlo en el dashboard.",
      keyboard: [["✅ Está bien"], ["✏️ Modificar en dashboard"], ["Cancelar"]],
    };
  }

  if (flow === "guided_final_review") {
    const dashboardRequired = requiresDashboardPublication(collected);
    if (choice.includes("publicar") && dashboardRequired)
      return finalReview(
        collected,
        "Por seguridad, los eventos complejos no se pueden publicar desde Telegram.",
      );
    if (choice.includes("publicar"))
      return {
        flow: "awaiting_confirmation",
        collected: { ...collected, telegram_save_mode: "publish" },
        action: "prepare_save",
        message: `${complexSummary(collected)}\n\n¿Confirmas que quieres publicarlo ahora?`,
        keyboard: [["Confirmar publicación"], ["Cancelar"]],
      };
    if (
      choice.includes("guardar borrador") ||
      choice.includes("revisar dashboard") ||
      choice.includes("guardar y revisar dashboard")
    )
      return {
        flow: "awaiting_confirmation",
        collected: {
          ...collected,
          telegram_save_mode: "draft",
          telegram_open_dashboard: choice.includes("revisar dashboard"),
        },
        action: "save_draft",
        message: "Estoy guardando el evento como borrador.",
      };
    return finalReview(collected);
  }

  if (flow === "complex_menu") {
    if (choice === "crear programas" || choice === "anadir programa")
      return {
        flow: "complex_program_name",
        collected,
        message: "¿Cómo se llama la modalidad o programa?",
      };
    if (choice === "crear semanas" || choice === "configurar periodos")
      return {
        flow: "complex_period_mode",
        collected,
        message: "¿Cómo quieres dividir las fechas del evento?",
        keyboard: [
          ["Semanas de 5 días", "Semanas de 6 días"],
          ["Semanas de 7 días"],
          ["Días individuales", "Meses"],
          ["Introducir periodo manual"],
          ["Menú"],
        ],
      };
    if (choice === "configurar precios") {
      if (!advanced.programs.length)
        return menu(
          collected,
          "Añade al menos un programa antes de configurar precios.",
        );
      return {
        flow: "complex_pricing_input",
        collected,
        message:
          "Describe las tarifas en un solo mensaje. Ejemplo: “Una semana cuesta 70 para socios y 80 para no socios; dos semanas 130 y 150; campus completo 350 y 400”.",
      };
    }
    if (choice === "elegir formulario")
      return {
        flow: "complex_form_template",
        collected,
        message: "¿Qué formulario quieres utilizar?",
        keyboard: [
          ["Campus completo", "Formulario básico"],
          ["Crear personalizado"],
          ["Menú"],
        ],
      };
    if (choice === "configurar inscripciones")
      return {
        flow: "complex_program_selection_mode",
        collected,
        message:
          "¿Cada participante puede elegir una sola modalidad o combinar varias, por ejemplo mañana y tarde?",
        keyboard: [["Una modalidad", "Varias modalidades"], ["Menú"]],
      };
    if (choice === "importar informacion")
      return {
        flow: "complex_import",
        collected,
        message:
          "Envíame el texto o el cartel que quieres incorporar al borrador.",
      };
    if (choice === "ver resumen") return menu(collected);
    if (choice === "guardar borrador")
      return {
        flow: "awaiting_confirmation",
        collected: { ...collected, telegram_save_mode: "draft" },
        action: "save_draft",
        message: "Estoy guardando el evento como borrador.",
      };
    return menu(collected, "No reconocí esa opción.");
  }

  if (flow === "complex_program_name") {
    if (text.trim().length < 2 || text.trim().length > 120)
      return {
        flow,
        collected,
        message: "Escribe un nombre de entre 2 y 120 caracteres.",
      };
    return {
      flow: "complex_program_turn",
      collected: {
        ...collected,
        telegram_program: { name: text.trim() },
      },
      message: "¿En qué turno se realiza?",
      keyboard: [
        ["Mañana", "Tarde"],
        ["Todo el día", "Personalizado"],
        ["Menú"],
      ],
    };
  }

  if (flow === "complex_program_turn") {
    const turns: Record<
      string,
      AdvancedEventDraft["programs"][number]["turn"]
    > = {
      manana: "morning",
      tarde: "afternoon",
      "todo el dia": "full_day",
      personalizado: "custom",
    };
    const turn = turns[choice];
    if (!turn)
      return {
        flow,
        collected,
        message: "Elige Mañana, Tarde, Todo el día o Personalizado.",
      };
    return {
      flow: "complex_program_schedule",
      collected: {
        ...collected,
        telegram_program: { ...scratch, turn },
      },
      message: "¿Cuál es el horario? Por ejemplo: “de 9:00 a 14:00”.",
      keyboard: [["Sin horario"], ["Menú"]],
    };
  }

  if (flow === "complex_program_schedule") {
    const schedule = choice === "sin horario" ? {} : parseTimeRange(text);
    if (!schedule)
      return {
        flow,
        collected,
        message:
          "Indica un rango válido, por ejemplo “de 9:00 a 14:00”, o elige Sin horario.",
      };
    return {
      flow: "complex_program_ages",
      collected: {
        ...collected,
        telegram_program: { ...scratch, ...schedule },
      },
      message: "¿Para qué edades? Por ejemplo: “de 6 a 16 años”.",
      keyboard: [["Todas las edades"], ["Menú"]],
    };
  }

  if (flow === "complex_program_ages") {
    const ages = choice === "todas las edades" ? {} : parseAgeRange(text);
    if (!ages)
      return {
        flow,
        collected,
        message:
          "Indica un rango válido, por ejemplo “de 6 a 16 años”, o elige Todas las edades.",
      };
    return {
      flow: "complex_program_capacity",
      collected: {
        ...collected,
        telegram_program: { ...scratch, ...ages },
      },
      message: "¿Cuántas plazas tiene esta modalidad?",
    };
  }

  if (flow === "complex_program_capacity") {
    const capacity = Number(text.trim());
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000)
      return {
        flow,
        collected,
        message: "Indica un número de plazas entre 1 y 100000.",
      };
    const program = {
      ...scratch,
      capacity,
      payment_timing: "immediate" as const,
      included_items: [] as string[],
    } as AdvancedEventDraft["programs"][number];
    const programs = advanced.programs.filter(
      (item) =>
        normalizeTelegramChoice(item.name) !==
        normalizeTelegramChoice(program.name),
    );
    const next = {
      ...collected,
      telegram_program: undefined,
      advanced: { ...advanced, programs: [...programs, program] },
    };
    return collected.telegram_program_editor_mode
      ? programEditor(next, `Modalidad “${program.name}” añadida.`)
      : collected.guided_creation
        ? nextGuidedConfiguration(next)
        : {
            flow: "complex_menu",
            collected: next,
            message: `Programa “${program.name}” añadido.`,
            keyboard: [["Añadir programa", "Configurar periodos"], ["Menú"]],
          };
  }

  if (flow === "complex_period_mode") {
    const configuration = periodConfiguration(choice);
    if (configuration) {
      const periods = configuredPeriods(
        configuration.unit,
        collected,
        configuration.weeklyDays,
      );
      if (!periods.length || periods.length > 52)
        return menu(
          collected,
          "No pude generar entre 1 y 52 periodos con esas fechas; introdúcelos manualmente.",
        );
      return menu(
        {
          ...collected,
          telegram_period_unit: configuration.unit,
          telegram_weekly_days: configuration.weeklyDays,
          advanced: { ...advanced, periods },
        },
        `He creado ${periods.length} periodos como ${configuration.label}.`,
      );
    }
    if (choice === "introducir periodo manual")
      return {
        flow: "complex_period_label",
        collected,
        message: "¿Cómo se llama el periodo? Por ejemplo: Semana 1.",
      };
    return {
      flow,
      collected,
      message: "Elige una división automática o Introducir periodo manual.",
      keyboard: [
        ["Semanas de 5 días", "Semanas de 6 días"],
        ["Semanas de 7 días"],
        ["Días individuales", "Meses"],
        ["Introducir periodo manual"],
        ["Menú"],
      ],
    };
  }

  if (flow === "complex_period_label") {
    if (text.trim().length < 2 || text.trim().length > 100)
      return {
        flow,
        collected,
        message: "Escribe una etiqueta válida para el periodo.",
      };
    return {
      flow: "complex_period_dates",
      collected: { ...collected, telegram_period_label: text.trim() },
      message: "Indica inicio y final en formato: 2026-06-22 al 2026-06-26.",
    };
  }

  if (flow === "complex_period_dates") {
    const dates = parsePeriodDates(text);
    if (!dates)
      return {
        flow,
        collected,
        message: "Usa dos fechas válidas: 2026-06-22 al 2026-06-26.",
      };
    const label = String(collected.telegram_period_label ?? "Periodo");
    const periods = advanced.periods.filter(
      (item) =>
        normalizeTelegramChoice(item.label) !== normalizeTelegramChoice(label),
    );
    const next = {
      ...collected,
      telegram_period_label: undefined,
      advanced: {
        ...advanced,
        periods: [...periods, { label, ...dates }],
      },
    };
    return {
      flow: "complex_menu",
      collected: next,
      message: `Periodo “${label}” añadido.`,
      keyboard: [["Configurar periodos", "Configurar precios"], ["Menú"]],
    };
  }

  if (flow === "complex_pricing_input")
    return { flow, collected, action: "parse_pricing", message: text };

  if (flow === "complex_pricing_confirmation") {
    if (choice === "confirmar precios" || choice === "correcto") {
      const pending = Array.isArray(collected.telegram_pending_prices)
        ? (collected.telegram_pending_prices as AdvancedEventDraft["prices"])
        : [];
      const keys = new Set(
        pending.map(
          (price) =>
            `${normalizeTelegramChoice(price.program_name)}|${price.audience}|${price.pricing_type ?? "fixed"}|${price.quantity_from ?? ""}|${price.quantity_to ?? ""}`,
        ),
      );
      const prices = advanced.prices.filter(
        (price) =>
          !keys.has(
            `${normalizeTelegramChoice(price.program_name)}|${price.audience}|${price.pricing_type ?? "fixed"}|${price.quantity_from ?? ""}|${price.quantity_to ?? ""}`,
          ),
      );
      const next = {
        ...collected,
        telegram_pending_prices: undefined,
        advanced: { ...advanced, prices: [...prices, ...pending] },
      };
      return collected.guided_creation
        ? nextGuidedConfiguration(next)
        : menu(next, `${pending.length} reglas de precio añadidas.`);
    }
    if (choice === "editar precios")
      return {
        flow: "complex_pricing_input",
        collected: { ...collected, telegram_pending_prices: undefined },
        message: "Describe nuevamente las tarifas.",
      };
    return {
      flow,
      collected,
      message: "Confirma las tarifas interpretadas o elige Editar precios.",
      keyboard: [["✅ Correcto", "✏️ Editar precios"], ["Menú"]],
    };
  }

  if (flow === "complex_form_template") {
    const templates: Record<string, RegistrationTemplateKey> = {
      "campus completo": "football_campus_full",
      basico: "basic",
      "formulario basico": "basic",
      personalizado: "blank",
      "crear personalizado": "blank",
    };
    const template = templates[choice];
    if (!template)
      return {
        flow,
        collected,
        message:
          "Elige Campus completo, Formulario básico o Crear personalizado.",
      };
    const names = {
      football_campus_full: "Campus completo",
      basic: "Formulario básico",
      blank: "Formulario personalizado",
    };
    const next = { ...collected, registration_template: template };
    if (collected.guided_creation)
      return {
        flow: "guided_form_review",
        collected: next,
        message: `${registrationFormPreview(template)}

¿Quieres utilizarlo así?`,
        keyboard: [
          ["✅ Está bien"],
          ["✏️ Modificar en dashboard"],
          ["Cancelar"],
        ],
      };
    return menu(
      next,
      `Plantilla “${names[template]}” seleccionada. Podrás personalizarla desde el dashboard.`,
    );
  }

  if (flow === "complex_program_selection_mode") {
    const allowMultiple =
      choice === "varias modalidades"
        ? true
        : choice === "una modalidad"
          ? false
          : null;
    if (allowMultiple == null)
      return {
        flow,
        collected,
        message: "Elige Una modalidad o Varias modalidades.",
        keyboard: [["Una modalidad", "Varias modalidades"], ["Menú"]],
      };
    const next = {
      ...collected,
      allow_multiple_programs: allowMultiple,
    };
    if (
      collected.guided_creation &&
      collected.telegram_periods_pending_dashboard
    )
      return {
        flow: "complex_registration_mode",
        collected: { ...next, allow_individual_periods: false },
        message:
          "Como los periodos se configurarán en el dashboard, esa selección queda pendiente. ¿Cómo quieres gestionar las inscripciones?",
        keyboard: [
          ["Inscripción directa"],
          ["Preinscripción y lista de espera"],
          ["Cancelar"],
        ],
      };
    return collected.guided_creation
      ? {
          flow: "guided_period_selection",
          collected: next,
          message: "¿Las semanas o periodos se pueden elegir individualmente?",
          keyboard: [
            ["Sí, cada semana"],
            ["Solo campus completo"],
            ["Cancelar"],
          ],
        }
      : {
          flow: "complex_registration_mode",
          collected: next,
          message: "¿Cómo quieres gestionar las inscripciones?",
          keyboard: [
            ["Inscripción directa"],
            ["Preinscripción y lista de espera"],
            ["Menú"],
          ],
        };
  }

  if (flow === "complex_registration_mode") {
    if (choice === "inscripcion directa")
      return collected.guided_creation
        ? {
            flow: "complex_form_template",
            collected: {
              ...collected,
              registration_mode: "direct",
              preregistration_limit: undefined,
              payment_invitation_hours: 24,
            },
            message: "¿Qué formulario quieres utilizar?",
            keyboard: [
              ["📋 Básico", "⚽ Campus completo"],
              ["🛠️ Crear personalizado"],
              ["Cancelar"],
            ],
          }
        : menu(
            {
              ...collected,
              registration_mode: "direct",
              preregistration_limit: undefined,
              payment_invitation_hours: 24,
            },
            "Configuré inscripción y pago directo.",
          );
    if (choice === "preinscripcion y lista de espera")
      return {
        flow: "complex_preregistration_limit",
        collected: {
          ...collected,
          registration_mode: "preregistration",
        },
        message:
          "¿Cuántas preinscripciones como máximo quieres admitir? Por ejemplo: 70.",
      };
    return {
      flow,
      collected,
      message: "Elige Inscripción directa o Preinscripción y lista de espera.",
      keyboard: [
        ["Inscripción directa"],
        ["Preinscripción y lista de espera"],
        ["Menú"],
      ],
    };
  }

  if (flow === "complex_preregistration_limit") {
    const limit = Number(text.trim());
    if (!Number.isInteger(limit) || limit < 1 || limit > 100000)
      return {
        flow,
        collected,
        message: "Indica un máximo entre 1 y 100000.",
      };
    return {
      flow: "complex_payment_invitation_hours",
      collected: { ...collected, preregistration_limit: limit },
      message:
        "Cuando se invite a pagar, ¿cuántas horas tendrá cada participante? Máximo 24.",
      keyboard: [["24 horas", "12 horas"], ["6 horas"], ["Menú"]],
    };
  }

  if (flow === "complex_payment_invitation_hours") {
    const hours = Number(text.match(/\d+/)?.[0]);
    if (!Number.isInteger(hours) || hours < 1 || hours > 24)
      return {
        flow,
        collected,
        message: "Indica un plazo entre 1 y 24 horas.",
      };
    const next = { ...collected, payment_invitation_hours: hours };
    return collected.guided_creation
      ? {
          flow: "complex_form_template",
          collected: next,
          message:
            "Preinscripción configurada. Los avisos y las invitaciones de pago se enviarán únicamente por correo.\n\n¿Qué formulario quieres utilizar?",
          keyboard: [
            ["📋 Básico", "⚽ Campus completo"],
            ["🛠️ Crear personalizado"],
            ["Cancelar"],
          ],
        }
      : menu(
          next,
          `Preinscripción configurada: máximo ${String(collected.preregistration_limit)} solicitudes y ${hours} horas para pagar. Los avisos se enviarán por correo.`,
        );
  }

  return {
    flow,
    collected,
    action: flow === "complex_import" ? "import" : undefined,
    message: text,
  };
}

export function pricingPreview(
  prices: AdvancedEventDraft["prices"],
  periods: AdvancedEventDraft["periods"] = [],
) {
  return prices
    .map((price) => {
      const audience =
        price.audience === "member"
          ? "Socio"
          : price.audience === "non_member"
            ? "No socio"
            : "General";
      const period = periods.find((candidate) => {
        const candidateLabel = normalizeTelegramChoice(candidate.label);
        return price.period_label
          ? candidateLabel === normalizeTelegramChoice(price.period_label)
          : normalizeTelegramChoice(price.label).includes(candidateLabel);
      });
      const dateRange = period ? formatPeriodDateRange(period) : null;
      const periodFirst = dateRange
        ? dateRange.replace(/^Periodo d/, "D")
        : price.pricing_type === "full_event"
          ? "Todo el evento"
          : "Sin periodo definido";
      const audienceSuffix =
        price.label.toLowerCase().includes(audience.toLowerCase()) ||
        price.audience === "all"
          ? ""
          : ` (${audience})`;
      return `• ${periodFirst} · ${price.program_name} · ${price.label}${audienceSuffix} €${price.amount}`;
    })
    .join("\n");
}

export function eventCompletionMessage({
  collected,
  eventId,
  slug,
  appUrl,
  savedAsDraft,
  dashboardPublicationRequired,
}: {
  collected: Record<string, unknown>;
  eventId: string;
  slug: string;
  appUrl: string;
  savedAsDraft: boolean;
  dashboardPublicationRequired: boolean;
}) {
  const baseUrl = appUrl.replace(/\/$/, "");
  const dashboardUrl = `${baseUrl}/dashboard/events/${eventId}`;
  const registrationUrl = `${baseUrl}/events/${slug}/register`;
  const title = String(collected.title ?? "Tu evento");

  if (savedAsDraft)
    return {
      message: dashboardPublicationRequired
        ? `✅ El evento “${title}” quedó preparado como borrador.

Como es un evento complejo, el siguiente paso es comprobar modalidades, periodos, tarifas y formulario en el dashboard. La publicación se realiza desde allí para evitar errores.

👉 Revisar y publicar:
${dashboardUrl}

Cuando esté publicado podrás compartir el enlace de inscripción con los participantes.

¿Qué quieres hacer ahora?`
        : `💾 Guardé “${title}” como borrador.

Puedes completar la revisión y publicarlo cuando quieras desde el dashboard:
${dashboardUrl}

¿Qué quieres hacer ahora?`,
      keyboard: [["Ver dashboard"], ["Crear otro evento", "Mis eventos"]],
    };

  return {
    message: `🎉 ¡Evento publicado correctamente!

“${title}” ya está disponible para recibir inscripciones.

📊 Gestionar evento:
${dashboardUrl}

🔗 Enlace para participantes:
${registrationUrl}

¿Qué quieres hacer ahora?`,
    keyboard: [["Crear otro evento"], ["Mis eventos", "Ver dashboard"]],
  };
}

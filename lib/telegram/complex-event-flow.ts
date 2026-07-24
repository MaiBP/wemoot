import type { AdvancedEventDraft } from "@/types/event";
import type { RegistrationTemplateKey } from "@/lib/forms/create-registration-template";

export type ComplexFlowName =
  | "event_creation_method"
  | "event_creation_description"
  | "event_creation_images"
  | "event_creation_detected_confirmation"
  | "event_creation_copy"
  | "guided_program_capacity"
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
    | "prepare_save";
}

export const eventCreationMethodKeyboard = [
  ["📝 Describir el evento"],
  ["🖼️ Enviar imágenes"],
  ["📂 Copiar evento anterior"],
  ["Cancelar"],
];

export const detectedEventKeyboard = [
  ["✅ Sí, continuar"],
  ["✏️ Corregir información"],
  ["❌ Empezar de nuevo"],
];

export const complexMenuKeyboard = [
  ["Crear programas", "Crear semanas"],
  ["Configurar precios", "Configurar inscripciones"],
  ["Elegir formulario", "Importar información"],
  ["Ver resumen"],
  ["Guardar borrador", "Cancelar"],
];

const complexFlows = new Set<ComplexFlowName>([
  "event_creation_method",
  "event_creation_description",
  "event_creation_images",
  "event_creation_detected_confirmation",
  "event_creation_copy",
  "guided_program_capacity",
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

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export function generateWeeklyPeriods(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  )
    return [];
  const periods: AdvancedEventDraft["periods"] = [];
  let cursor = start;
  while (cursor <= end && periods.length < 52) {
    const weekday = cursor.getUTCDay();
    const daysToEnd =
      weekday >= 1 && weekday <= 5 ? 5 - weekday : weekday === 6 ? 1 : 0;
    const periodEnd = new Date(
      Math.min(addDays(cursor, daysToEnd).getTime(), end.getTime()),
    );
    periods.push({
      label: `Semana ${periods.length + 1}`,
      start_date: iso(cursor),
      end_date: iso(periodEnd),
    });
    cursor = addDays(periodEnd, periodEnd.getUTCDay() === 5 ? 3 : 1);
  }
  return periods;
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
  return `Resumen del campus:\n\n• ${String(collected.title ?? "Sin nombre")}\n• Programas: ${advanced.programs.length} (${multiplePrograms})\n• Semanas: ${advanced.periods.length}\n• Reglas de precio: ${advanced.prices.length}\n• Inscripciones: ${registration}\n• Formulario: ${templateName}`;
}

const turnName = (
  turn: AdvancedEventDraft["programs"][number]["turn"],
) =>
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
          return `• ${program.name} · ${turnName(program.turn)}${schedule}${ages}`;
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
  let advanced = getAdvancedDraft(collected);
  let nextCollected = collected;
  if (!advanced.periods.length) {
    const periods = generateWeeklyPeriods(
      String(collected.start_date ?? ""),
      String(collected.end_date ?? ""),
    );
    if (periods.length) {
      advanced = { ...advanced, periods };
      nextCollected = { ...collected, advanced };
    }
  }
  if (!advanced.programs.length)
    return {
      flow: "complex_program_name",
      collected: nextCollected,
      message:
        "No detecté ninguna modalidad. ¿Cómo se llama la primera? Por ejemplo: Tecnificación de mañana.",
    };
  if (advanced.programs.some((program) => !program.capacity))
    return {
      flow: "guided_program_capacity",
      collected: nextCollected,
      message:
        "¿Cuántas plazas tendrá cada modalidad? Si todas tienen el mismo aforo, responde solo con un número. También puedes escribir, por ejemplo: “Mañana 40, Tarde 30”.",
    };
  return {
    flow: "complex_program_selection_mode",
    collected: nextCollected,
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

export function handleComplexFlowStep(
  flow: ComplexFlowName,
  text: string,
  collected: Record<string, unknown>,
): ComplexFlowResult {
  const choice = normalizeTelegramChoice(text);
  const advanced = getAdvancedDraft(collected);
  const scratch = (collected.telegram_program ?? {}) as Record<string, unknown>;
  if (choice === "menu" || choice === "volver") return menu(collected);

  if (flow === "event_creation_method") {
    if (choice.includes("describir el evento"))
      return {
        flow: "event_creation_description",
        collected: { ...collected, guided_creation: true },
        message:
          "Descríbeme el evento en un solo mensaje. Incluye todo lo que sepas: nombre, lugar, fechas, modalidades, horarios, edades, semanas y precios.",
        keyboard: [["Cancelar"]],
      };
    if (choice.includes("enviar imagenes") || choice.includes("enviar imágenes"))
      return {
        flow: "event_creation_images",
        collected: {
          ...collected,
          guided_creation: true,
          telegram_attachment_count: 0,
        },
        message:
          "Envíame los carteles uno a uno como imágenes. Iré incorporando la información de cada imagen. Cuando termines, pulsa “Analizar información”.",
        keyboard: [["🔎 Analizar información"], ["Cancelar"]],
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
    if (choice.includes("analizar informacion"))
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
              "Aún no recibí ninguna imagen. Envíame un cartel y después pulsa “Analizar información”.",
            keyboard: [["🔎 Analizar información"], ["Cancelar"]],
          };
    return {
      flow,
      collected,
      message:
        "Envíame otra imagen o pulsa “Analizar información” cuando hayas terminado.",
      keyboard: [["🔎 Analizar información"], ["Cancelar"]],
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
          message: `He interpretado estas tarifas:\n\n${pricingPreview(advanced.prices)}\n\n¿Son correctas?`,
          keyboard: [["✅ Correcto", "✏️ Editar precios"], ["Cancelar"]],
        };
      return nextGuidedConfiguration(collected);
    }
    if (choice.includes("corregir informacion"))
      return {
        flow: "event_creation_description",
        collected,
        message:
          "Indícame en un solo mensaje qué debo corregir o añadir. Conservaré el resto de la información.",
        keyboard: [["Cancelar"]],
      };
    if (choice.includes("empezar de nuevo"))
      return {
        flow: "event_creation_method",
        collected: {
          event_mode: "advanced",
          guided_creation: true,
          advanced: { programs: [], periods: [], prices: [], uncertainties: [] },
        },
        message: "Empecemos de nuevo. ¿Cómo quieres crear el evento?",
        keyboard: eventCreationMethodKeyboard,
      };
    return {
      flow,
      collected,
      message: detectedEventSummary(collected),
      keyboard: detectedEventKeyboard,
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
    const percentage = Number(text.match(/\d+(?:[.,]\d+)?/)?.[0].replace(",", "."));
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
      message:
        `Aplicaré un ${percentage}% al seleccionar todas las semanas.\n\n¿Cómo quieres gestionar las inscripciones?`,
      keyboard: [
        ["Inscripción directa"],
        ["Preinscripción y lista de espera"],
        ["Cancelar"],
      ],
    };
  }

  if (flow === "guided_form_review") {
    if (choice.includes("esta bien") || choice.includes("está bien"))
      return {
        flow: "guided_final_review",
        collected,
        message: `${complexSummary(collected)}

Todo está preparado. Los avisos a participantes se enviarán únicamente por correo.

¿Qué quieres hacer ahora?`,
        keyboard: [
          ["🚀 Publicar"],
          ["💾 Guardar borrador"],
          ["👀 Revisar dashboard"],
          ["Cancelar"],
        ],
      };
    if (choice.includes("modificar"))
      return {
        flow: "guided_final_review",
        collected: { ...collected, telegram_review_form: true },
        message:
          "Guardaré el evento como borrador para que personalices el formulario en el dashboard.",
        keyboard: [["👀 Revisar dashboard"], ["💾 Guardar borrador"], ["Cancelar"]],
      };
    return {
      flow,
      collected,
      message: "Confirma el formulario o elige modificarlo en el dashboard.",
      keyboard: [["✅ Está bien"], ["✏️ Modificar en dashboard"], ["Cancelar"]],
    };
  }

  if (flow === "guided_final_review") {
    if (choice.includes("publicar"))
      return {
        flow: "awaiting_confirmation",
        collected: { ...collected, telegram_save_mode: "publish" },
        action: "prepare_save",
        message: `${complexSummary(collected)}\n\n¿Confirmas que quieres publicarlo ahora?`,
        keyboard: [["Confirmar publicación"], ["Cancelar"]],
      };
    if (choice.includes("guardar borrador") || choice.includes("revisar dashboard"))
      return {
        flow: "awaiting_confirmation",
        collected: {
          ...collected,
          telegram_save_mode: "draft",
          telegram_open_dashboard: choice.includes("revisar dashboard"),
        },
        action: "prepare_save",
        message: `${complexSummary(collected)}\n\nGuardaré el evento como borrador y te daré el enlace del dashboard. ¿Confirmas?`,
        keyboard: [["Confirmar borrador"], ["Cancelar"]],
      };
    return {
      flow,
      collected,
      message: "Elige Publicar, Guardar borrador o Revisar dashboard.",
      keyboard: [
        ["🚀 Publicar"],
        ["💾 Guardar borrador"],
        ["👀 Revisar dashboard"],
        ["Cancelar"],
      ],
    };
  }

  if (flow === "complex_menu") {
    if (choice === "crear programas" || choice === "anadir programa")
      return {
        flow: "complex_program_name",
        collected,
        message: "¿Cómo se llama la modalidad o programa?",
      };
    if (choice === "crear semanas")
      return {
        flow: "complex_period_mode",
        collected,
        message: "¿Quieres dividir automáticamente las fechas del evento?",
        keyboard: [
          ["Crear semanas automáticamente"],
          ["Introducir fechas"],
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
        collected,
        action: "prepare_save",
        message: `${complexSummary(collected)}\n\nGuardaré el evento como borrador para revisarlo en el dashboard. ¿Confirmas?`,
        keyboard: [["Confirmar borrador", "Cancelar"]],
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
    return collected.guided_creation
      ? nextGuidedConfiguration(next)
      : {
          flow: "complex_menu",
          collected: next,
          message: `Programa “${program.name}” añadido.`,
          keyboard: [["Añadir programa", "Crear semanas"], ["Menú"]],
        };
  }

  if (flow === "complex_period_mode") {
    if (choice === "crear semanas automaticamente") {
      const periods = generateWeeklyPeriods(
        String(collected.start_date ?? ""),
        String(collected.end_date ?? ""),
      );
      if (!periods.length)
        return menu(
          collected,
          "No pude dividir esas fechas; introdúcelas manualmente.",
        );
      return menu(
        { ...collected, advanced: { ...advanced, periods } },
        `He creado ${periods.length} semanas automáticamente.`,
      );
    }
    if (choice === "introducir fechas")
      return {
        flow: "complex_period_label",
        collected,
        message: "¿Cómo se llama el periodo? Por ejemplo: Semana 1.",
      };
    return {
      flow,
      collected,
      message: "Elige creación automática o Introducir fechas.",
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
      keyboard: [["Crear semanas", "Configurar precios"], ["Menú"]],
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
        keyboard: [["✅ Está bien"], ["✏️ Modificar en dashboard"], ["Cancelar"]],
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
    return collected.guided_creation
      ? {
          flow: "guided_period_selection",
          collected: next,
          message:
            "¿Las semanas o periodos se pueden elegir individualmente?",
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

export function pricingPreview(prices: AdvancedEventDraft["prices"]) {
  return prices
    .map((price) => {
      const audience =
        price.audience === "member"
          ? "Socio"
          : price.audience === "non_member"
            ? "No socio"
            : "General";
      return `• ${price.program_name} · ${price.label} · ${audience}: ${price.amount} €`;
    })
    .join("\n");
}

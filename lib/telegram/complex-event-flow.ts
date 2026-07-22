import type { AdvancedEventDraft } from "@/types/event";
import type { RegistrationTemplateKey } from "@/lib/forms/create-registration-template";

export type ComplexFlowName =
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
  | "complex_import";

export interface ComplexFlowResult {
  flow: ComplexFlowName | "awaiting_confirmation";
  collected: Record<string, unknown>;
  message: string;
  keyboard?: string[][];
  action?: "parse_pricing" | "import" | "prepare_save";
}

export const complexMenuKeyboard = [
  ["Crear programas", "Crear semanas"],
  ["Configurar precios", "Elegir formulario"],
  ["Importar información", "Ver resumen"],
  ["Guardar borrador", "Cancelar"],
];

const complexFlows = new Set<ComplexFlowName>([
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
    .toLowerCase();
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
  return `Resumen del campus:\n\n• ${String(collected.title ?? "Sin nombre")}\n• Programas: ${advanced.programs.length}\n• Semanas: ${advanced.periods.length}\n• Reglas de precio: ${advanced.prices.length}\n• Formulario: ${templateName}`;
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
    return {
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
    if (choice === "confirmar precios") {
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
      return menu(
        {
          ...collected,
          telegram_pending_prices: undefined,
          advanced: { ...advanced, prices: [...prices, ...pending] },
        },
        `${pending.length} reglas de precio añadidas.`,
      );
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
      keyboard: [["Confirmar precios", "Editar precios"], ["Menú"]],
    };
  }

  if (flow === "complex_form_template") {
    const templates: Record<string, RegistrationTemplateKey> = {
      "campus completo": "football_campus_full",
      "formulario basico": "basic",
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
    return menu(
      { ...collected, registration_template: template },
      `Plantilla “${names[template]}” seleccionada. Podrás personalizarla desde el dashboard.`,
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

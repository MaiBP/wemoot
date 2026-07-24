import type OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAI } from "@/lib/openai";
import { advancedEventDraftSchema } from "@/lib/validations";
import type { ParsedEvent } from "@/types/event";
import { expandInterpretedPrices } from "@/lib/telegram/complex-event-flow";

const eventDataSchema = z.object({
  title: z.string().optional(),
  event_type: z.string().optional(),
  description: z.string().nullable().optional(),
  city: z.string().optional(),
  location: z.string().nullable().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  schedule: z.string().nullable().optional(),
  age_range: z.string().nullable().optional(),
  price: z.coerce.number().optional(),
  capacity: z.coerce.number().int().optional(),
  event_mode: z.enum(["simple", "advanced"]).optional(),
  organizer_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
});

const aiEventDataSchema = z.object({
  title: z.string().nullable(),
  event_type: z.string().nullable(),
  description: z.string().nullable(),
  city: z.string().nullable(),
  location: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  schedule: z.string().nullable(),
  age_range: z.string().nullable(),
  price: z.number().nullable(),
  capacity: z.number().int().nullable(),
  organizer_name: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
});

const aiAdvancedSchema = z.object({
  programs: z.array(
    z.object({
      name: z.string(),
      turn: z.enum(["morning", "afternoon", "full_day", "custom"]),
      description: z.string().nullable(),
      start_time: z.string().nullable(),
      end_time: z.string().nullable(),
      min_age: z.number().int().nullable(),
      max_age: z.number().int().nullable(),
      capacity: z.number().int().nullable(),
      payment_timing: z.enum(["immediate", "reserve", "deferred"]),
      payment_due_date: z.string().nullable(),
      included_items: z.array(z.string()),
    }),
  ),
  periods: z.array(
    z.object({
      label: z.string(),
      start_date: z.string(),
      end_date: z.string(),
    }),
  ),
  prices: z.array(
    z.object({
      program_name: z.string(),
      period_label: z.string().nullable(),
      label: z.string(),
      audience: z.enum(["all", "member", "non_member"]),
      amount: z.number(),
      pricing_type: z.enum([
        "fixed",
        "per_period",
        "period_bundle",
        "full_event",
        "early_bird",
        "manual",
      ]),
      quantity_from: z.number().int().nullable(),
      quantity_to: z.number().int().nullable(),
    }),
  ),
  uncertainties: z.array(z.string()),
});

const aiResponseSchema = z.object({
  intent: z.enum(["create_event", "list_events", "help", "unknown"]),
  event: aiEventDataSchema,
  missing_fields: z.array(z.string()),
  social_copy: z.string(),
  whatsapp_message: z.string(),
  event_mode: z.enum(["simple", "advanced"]),
  advanced: aiAdvancedSchema,
});

const required = [
  "title",
  "event_type",
  "city",
  "start_date",
  "end_date",
  "price",
  "capacity",
] as const;

const emptyAdvanced: z.infer<typeof advancedEventDraftSchema> = {
  programs: [],
  periods: [],
  prices: [],
  uncertainties: [],
};

function fallback(text: string): ParsedEvent {
  const lower = text.toLowerCase();
  const advanced =
    /modalidad|programa|varias semanas|mañana y tarde|tarifas|cartel/.test(
      lower,
    );
  return {
    intent: lower.includes("mis eventos")
      ? "list_events"
      : lower.includes("ayuda")
        ? "help"
        : lower.includes("evento") ||
            lower.includes("campus") ||
            lower.includes("torneo")
          ? "create_event"
          : "unknown",
    event: {},
    missing_fields: advanced
      ? required.filter((field) => field !== "price" && field !== "capacity")
      : [...required],
    social_copy: "",
    whatsapp_message: "",
    event_mode: advanced ? "advanced" : "simple",
    advanced: advanced ? emptyAdvanced : undefined,
  };
}

function normalizeIntent(
  intent: string,
  hasExistingEvent: boolean,
): ParsedEvent["intent"] {
  if (intent === "list_events" || intent === "help") return intent;
  if (intent === "create_event" || hasExistingEvent) return "create_event";
  return "unknown";
}

function mergeByKey<T>(previous: T[], incoming: T[], key: (item: T) => string) {
  const merged = new Map(
    previous.map((item) => [key(item).toLowerCase(), item]),
  );
  for (const item of incoming) merged.set(key(item).toLowerCase(), item);
  return [...merged.values()];
}

export function normalizeParsedEvent(
  raw: unknown,
  existing: Record<string, unknown> = {},
): ParsedEvent {
  const parsed = aiResponseSchema.parse(raw);
  const knownEventValues = Object.fromEntries(
    Object.entries(parsed.event).filter(([, value]) => value !== null),
  );
  const event = eventDataSchema.parse({ ...existing, ...knownEventValues });
  const previousAdvanced = advancedEventDraftSchema
    .catch(emptyAdvanced)
    .parse(existing.advanced);
  const incomingAdvanced = parsed.advanced ?? emptyAdvanced;
  const eventMode =
    parsed.event_mode ??
    event.event_mode ??
    (incomingAdvanced.programs.length ? "advanced" : "simple");
  const fieldsToRequire =
    eventMode === "advanced"
      ? required.filter((field) => field !== "price" && field !== "capacity")
      : required;
  const missingFields = fieldsToRequire.filter((field) => {
    const value = event[field];
    return value === undefined || value === null || value === "";
  });

  return {
    intent: normalizeIntent(parsed.intent, Object.keys(existing).length > 0),
    event,
    missing_fields: missingFields,
    social_copy: parsed.social_copy,
    whatsapp_message: parsed.whatsapp_message,
    event_mode: eventMode,
    advanced:
      eventMode === "advanced"
        ? {
            programs: mergeByKey(
              previousAdvanced.programs,
              incomingAdvanced.programs,
              (item) => item.name,
            ),
            periods: mergeByKey(
              previousAdvanced.periods,
              incomingAdvanced.periods,
              (item) => item.label,
            ),
            prices: mergeByKey(
              previousAdvanced.prices,
              incomingAdvanced.prices,
              (item) =>
                `${item.program_name}|${item.period_label ?? ""}|${item.label}|${item.audience}`,
            ),
            uncertainties: [
              ...new Set([
                ...previousAdvanced.uncertainties,
                ...incomingAdvanced.uncertainties,
              ]),
            ],
          }
        : undefined,
  };
}

export async function parseEventMessage(
  message: string,
  existing: Record<string, unknown> = {},
  attachment?:
    | string
    | {
        dataUrl: string;
        filename: string;
        mimeType: string;
        kind: "image";
      },
): Promise<ParsedEvent> {
  if (!process.env.OPENAI_API_KEY) return fallback(message);

  const openai = getOpenAI();
  const normalizedAttachment =
    typeof attachment === "string"
      ? {
          dataUrl: attachment,
          filename: "cartel.jpg",
          mimeType: "image/jpeg",
          kind: "image" as const,
        }
      : attachment;
  const userPayload = JSON.stringify({
    existing_event: existing,
    message: message.slice(0, 4000),
  });
  const instructions = `Eres el parser de WeMoot. Interpreta mensajes, documentos visuales y carteles en español o inglés sobre eventos de fútbol. Fecha actual: ${new Date().toISOString().slice(0, 10)}. Devuelve SOLO la estructura solicitada con intent, event, event_mode, advanced, missing_fields, social_copy y whatsapp_message. Usa event_mode="advanced" cuando haya varias modalidades, turnos, periodos o tarifas. No confundas categorías o grupos de edad con modalidades: si todas las categorías participan en un único evento, con el mismo horario y un único precio final, usa event_mode="simple", guarda ese importe en event.price y no crees programs, periods ni prices. Para advanced devuelve programs, periods, prices y uncertainties. Cada precio referencia program_name y opcionalmente period_label. Si una tarifa corresponde a una semana o periodo concreto, period_label es obligatorio y debe coincidir exactamente con el label del periodo relacionado; no lo dejes nulo. Si hay un único precio para todo el evento avanzado, usa pricing_type="full_event", sin period_label y con cantidades nulas. Cuando existing_event ya contiene una modalidad y el nuevo mensaje menciona su nombre para corregir turno u horario, actualiza esa modalidad; no añadas otra duplicada. audience es all, member o non_member. pricing_type es fixed, per_period, period_bundle, full_event, early_bird o manual; usa quantity_from y quantity_to para el número de semanas. turn es morning, afternoon, full_day o custom. payment_timing es immediate, reserve o deferred. Fechas YYYY-MM-DD y horas HH:mm. No inventes datos: cualquier contradicción o dato dudoso va en uncertainties. En eventos simples los campos mínimos son ${required.join(", ")}; en avanzados price y capacity se configuran por programa y no son obligatorios en event. Conserva y combina los datos existentes. Genera copy sólo cuando haya datos suficientes.`;

  const userMessage: OpenAI.Chat.Completions.ChatCompletionUserMessageParam = {
    role: "user",
    content: normalizedAttachment
      ? [
          { type: "text", text: userPayload },
          {
            type: "image_url",
            image_url: { url: normalizedAttachment.dataUrl, detail: "high" },
          },
        ]
      : userPayload,
  };
  const response = await openai.chat.completions.parse({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    response_format: zodResponseFormat(aiResponseSchema, "wemoot_event_draft"),
    messages: [
      {
        role: "system",
        content: instructions,
      },
      userMessage,
    ],
  });

  const parsed = response.choices[0]?.message.parsed;
  if (!parsed) throw new Error("OpenAI no devolvió un borrador estructurado");
  return normalizeParsedEvent(parsed, existing);
}

const pricingInterpretationSchema = z.object({
  prices: z.array(
    z.object({
      program_name: z.string().nullable(),
      label: z.string(),
      audience: z.enum(["all", "member", "non_member"]),
      amount: z.number().nonnegative(),
      pricing_type: z.enum([
        "fixed",
        "per_period",
        "period_bundle",
        "full_event",
        "early_bird",
        "manual",
      ]),
      quantity_from: z.number().int().positive().nullable(),
      quantity_to: z.number().int().positive().nullable(),
    }),
  ),
  uncertainties: z.array(z.string()),
});

export function normalizePricingInterpretation(
  raw: unknown,
  programNames: string[],
) {
  const parsed = pricingInterpretationSchema.parse(raw);
  return expandInterpretedPrices(
    parsed.prices,
    programNames,
    parsed.uncertainties,
  );
}

export async function parseComplexPricingMessage(
  message: string,
  programNames: string[],
) {
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OpenAI no está configurado para interpretar precios");
  const openai = getOpenAI();
  const response = await openai.chat.completions.parse({
    model: "gpt-4.1-mini",
    temperature: 0.1,
    response_format: zodResponseFormat(
      pricingInterpretationSchema,
      "wemoot_pricing_rules",
    ),
    messages: [
      {
        role: "system",
        content:
          "Interpreta tarifas de un evento deportivo y devuelve únicamente la estructura solicitada. No inventes importes. Usa audience member para socio, non_member para no socio y all para general. Una tarifa por cada periodo usa per_period y cantidad 1. Un bono de varias semanas usa period_bundle con quantity_from y quantity_to iguales al número indicado. Un precio único y final para todo el evento, aunque se mencionen varias categorías o edades participantes, usa full_event con cantidades nulas. No interpretes categorías de edad como programas. Si no se menciona un programa, deja program_name nulo para aplicar la tarifa a todos. Si algo es ambiguo, indícalo en uncertainties.",
      },
      {
        role: "user",
        content: JSON.stringify({ message, available_programs: programNames }),
      },
    ],
  });
  const parsed = response.choices[0]?.message.parsed;
  if (!parsed) throw new Error("No se pudieron interpretar las tarifas");
  return normalizePricingInterpretation(parsed, programNames);
}

export async function generateMarketingCopy(event: {
  title: string;
  city: string;
  start_date: string;
  end_date: string;
  price: number;
  capacity: number;
  description?: string | null;
}) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI no configurado");

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Genera JSON con social_copy y whatsapp_message en español. Copy breve, claro, sin afirmar datos no proporcionados.",
      },
      { role: "user", content: JSON.stringify(event) },
    ],
  });

  return z
    .object({ social_copy: z.string(), whatsapp_message: z.string() })
    .parse(JSON.parse(response.choices[0]?.message.content ?? "{}"));
}

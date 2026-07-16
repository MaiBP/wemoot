import { z } from "zod";
import { getOpenAI } from "@/lib/openai";
import type { ParsedEvent } from "@/types/event";

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
});

const aiResponseSchema = z.object({
  intent: z.string().default("unknown"),
  event: eventDataSchema.default({}),
  missing_fields: z.array(z.string()).default([]),
  social_copy: z.string().default(""),
  whatsapp_message: z.string().default(""),
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

function fallback(text: string): ParsedEvent {
  const lower = text.toLowerCase();
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
    missing_fields: [...required],
    social_copy: "",
    whatsapp_message: "",
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

export function normalizeParsedEvent(
  raw: unknown,
  existing: Record<string, unknown> = {},
): ParsedEvent {
  const parsed = aiResponseSchema.parse(raw);
  const event = eventDataSchema.parse({ ...existing, ...parsed.event });
  const missingFields = required.filter((field) => {
    const value = event[field];
    return value === undefined || value === null || value === "";
  });

  return {
    intent: normalizeIntent(parsed.intent, Object.keys(existing).length > 0),
    event,
    missing_fields: missingFields,
    social_copy: parsed.social_copy,
    whatsapp_message: parsed.whatsapp_message,
  };
}

export async function parseEventMessage(
  message: string,
  existing: Record<string, unknown> = {},
): Promise<ParsedEvent> {
  if (!process.env.OPENAI_API_KEY) return fallback(message);

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Eres el parser de WeMoot. Interpreta mensajes en español o inglés sobre eventos de fútbol. Fecha actual: ${new Date().toISOString().slice(0, 10)}. Devuelve SOLO JSON con intent, event, missing_fields, social_copy, whatsapp_message. Usa intent "create_event" también cuando el usuario esté completando o corrigiendo un evento en curso. Fechas YYYY-MM-DD. Campos mínimos: ${required.join(", ")}. Conserva y combina los datos existentes. No inventes datos factuales. Genera copy solo cuando haya datos suficientes.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          existing_event: existing,
          message: message.slice(0, 4000),
        }),
      },
    ],
  });

  const raw = JSON.parse(response.choices[0]?.message.content ?? "{}");
  return normalizeParsedEvent(raw, existing);
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

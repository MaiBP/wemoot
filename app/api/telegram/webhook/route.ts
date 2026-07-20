import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseEventMessage } from "@/lib/event-parser";
import { createSlug } from "@/lib/slug";
import {
  advancedEventBaseSchema,
  advancedEventDraftSchema,
  eventSchema,
} from "@/lib/validations";
import {
  getTelegramImageDataUrl,
  sendTelegramMessage,
  type TelegramUpdate,
} from "@/lib/telegram";
import type { AdvancedEventDraft } from "@/types/event";
const fieldNames: Record<string, string> = {
  title: "nombre",
  event_type: "tipo",
  city: "ciudad",
  start_date: "fecha de inicio",
  end_date: "fecha final",
  price: "precio",
  capacity: "número de plazas",
  location: "ubicación exacta",
  schedule: "horario",
};
const yes = /^(sí|si|yes|publica|publícalo|publicar|confirmar|guardar borrador)$/i;

async function saveAdvancedStructure(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  draft: AdvancedEventDraft,
) {
  const { data: programs, error: programsError } = draft.programs.length
    ? await admin
        .from("event_programs")
        .insert(
          draft.programs.map((program, position) => ({
            event_id: eventId,
            name: program.name,
            turn: program.turn ?? "custom",
            description: program.description ?? null,
            start_time: program.start_time ?? null,
            end_time: program.end_time ?? null,
            min_age: program.min_age ?? null,
            max_age: program.max_age ?? null,
            capacity: program.capacity ?? 1,
            payment_timing: program.payment_timing ?? "immediate",
            payment_due_date: program.payment_due_date ?? null,
            included_items: program.included_items ?? [],
            position,
          })),
        )
        .select("id,name")
    : { data: [], error: null };
  if (programsError) throw programsError;

  const { data: periods, error: periodsError } = draft.periods.length
    ? await admin
        .from("event_periods")
        .insert(
          draft.periods.map((period, position) => ({
            event_id: eventId,
            ...period,
            position,
          })),
        )
        .select("id,label")
    : { data: [], error: null };
  if (periodsError) throw periodsError;

  const programIds = new Map(
    (programs ?? []).map((program) => [program.name.toLowerCase(), program.id]),
  );
  const periodIds = new Map(
    (periods ?? []).map((period) => [period.label.toLowerCase(), period.id]),
  );
  const prices = draft.prices.flatMap((price, position) => {
    const programId = programIds.get(price.program_name.toLowerCase());
    if (!programId) return [];
    return [
      {
        event_id: eventId,
        program_id: programId,
        period_id: price.period_label
          ? (periodIds.get(price.period_label.toLowerCase()) ?? null)
          : null,
        label: price.label,
        audience: price.audience,
        amount: price.amount,
        position,
      },
    ];
  });
  if (prices.length) {
    const { error } = await admin.from("event_prices").insert(prices);
    if (error) throw error;
  }
}
export async function POST(request: Request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (
    !process.env.TELEGRAM_WEBHOOK_SECRET ||
    secret !== process.env.TELEGRAM_WEBHOOK_SECRET
  )
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message || (!message.text && !message.caption && !message.photo && !message.document)) {
    return NextResponse.json({ ok: true });
  }
  const chatId = String(message.chat.id);
  const text = (message.text ?? message.caption ?? "Importar este cartel como borrador de evento avanzado")
    .trim()
    .slice(0, 4000);
  const admin = createAdminClient();
  try {
    const imageDataUrl = await getTelegramImageDataUrl(message);
    const { data: account } = await admin
      .from("telegram_accounts")
      .select("*, profiles(*)")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();
    let { data: state } = await admin
      .from("conversation_states")
      .select("*")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();
    if (!account) {
      if (!state) {
        await admin.from("conversation_states").insert({
          telegram_chat_id: chatId,
          current_flow: "onboarding_email",
          collected_data: {},
          missing_fields: [],
          last_message: text,
        });
        await sendTelegramMessage(
          chatId,
          "¡Hola! Soy el asistente de WeMoot ⚽\nPara conectar tu cuenta, dime el email con el que te registraste en el dashboard.",
        );
        return NextResponse.json({ ok: true });
      }
      if (state.current_flow === "onboarding_email") {
        const { data: profile } = await admin
          .from("profiles")
          .select("id, full_name")
          .eq("email", text.toLowerCase())
          .maybeSingle();
        if (!profile) {
          await sendTelegramMessage(
            chatId,
            "No encuentro ese email. Crea primero tu cuenta en el dashboard y vuelve a enviármelo.",
          );
          return NextResponse.json({ ok: true });
        }
        await admin.from("telegram_accounts").insert({
          profile_id: profile.id,
          telegram_chat_id: chatId,
          telegram_username: message.from?.username ?? null,
        });
        await admin
          .from("conversation_states")
          .update({
            profile_id: profile.id,
            current_flow: null,
            collected_data: {},
            updated_at: new Date().toISOString(),
          })
          .eq("telegram_chat_id", chatId);
        await sendTelegramMessage(
          chatId,
          `Cuenta conectada${profile.full_name ? `, ${profile.full_name}` : ""}. Escribe “crear evento” o descríbeme directamente lo que quieres organizar.`,
        );
        return NextResponse.json({ ok: true });
      }
    }
    if (!account) return NextResponse.json({ ok: true });
    const profileId = account.profile_id as string;
    if (text === "/start" || text.toLowerCase() === "ayuda") {
      await sendTelegramMessage(
        chatId,
        "Puedo crear eventos y consultar tus eventos.\n\nEscribe una descripción natural, por ejemplo:\n“Quiero crear un campus del 15 al 19 de julio en Barcelona, 75 €, 40 plazas.”\n\nComandos: crear evento · mis eventos · ayuda",
      );
      return NextResponse.json({ ok: true });
    }
    if (text.toLowerCase() === "mis eventos") {
      const { data: events } = await admin
        .from("events")
        .select("id,title,start_date,status")
        .eq("owner_id", profileId)
        .order("start_date", { ascending: false })
        .limit(10);
      const reply = events?.length
        ? events
            .map((e) => `• ${e.title} · ${e.start_date} · ${e.status}`)
            .join("\n")
        : "Todavía no tienes eventos.";
      await sendTelegramMessage(chatId, reply);
      return NextResponse.json({ ok: true });
    }
    state =
      state ??
      (
        await admin
          .from("conversation_states")
          .insert({
            telegram_chat_id: chatId,
            profile_id: profileId,
            current_flow: null,
            collected_data: {},
            missing_fields: [],
          })
          .select()
          .single()
      ).data;
    if (state?.current_flow === "awaiting_confirmation" && /^cancelar$/i.test(text)) {
      await admin
        .from("conversation_states")
        .update({ current_flow: null, collected_data: {}, missing_fields: [] })
        .eq("telegram_chat_id", chatId);
      await sendTelegramMessage(chatId, "Borrador descartado. Puedes comenzar otro evento cuando quieras.");
      return NextResponse.json({ ok: true });
    }
    if (state?.current_flow === "awaiting_confirmation" && yes.test(text)) {
      const collectedData = state.collected_data as Record<string, unknown>;
      const advancedDraft = advancedEventDraftSchema
        .catch({ programs: [], periods: [], prices: [], uncertainties: [] })
        .parse(collectedData.advanced);
      const isAdvanced =
        collectedData.event_mode === "advanced" || advancedDraft.programs.length > 0;
      const parsed = isAdvanced
        ? advancedEventBaseSchema.safeParse(collectedData)
        : eventSchema.safeParse(collectedData);
      if (!parsed.success) {
        await sendTelegramMessage(
          chatId,
          "El borrador está incompleto. Empecemos de nuevo: descríbeme el evento.",
        );
        await admin
          .from("conversation_states")
          .update({
            current_flow: null,
            collected_data: {},
            missing_fields: [],
          })
          .eq("telegram_chat_id", chatId);
        return NextResponse.json({ ok: true });
      }
      const copy = collectedData;
      const minimumPrice = advancedDraft.prices.length
        ? Math.min(...advancedDraft.prices.map((price) => price.amount))
        : 0;
      const totalCapacity = advancedDraft.programs.reduce(
        (total, program) => total + (program.capacity ?? 0),
        0,
      );
      const saveOnly = /^guardar borrador$/i.test(text);
      const { data: event, error } = await admin
        .from("events")
        .insert({
          ...parsed.data,
          price: isAdvanced ? minimumPrice : (parsed.data as { price: number }).price,
          capacity: isAdvanced ? Math.max(totalCapacity, 1) : (parsed.data as { capacity: number }).capacity,
          ...(isAdvanced ? { event_mode: "advanced" } : {}),
          owner_id: profileId,
          organization_id: null,
          slug: createSlug(parsed.data.title),
          payment_mode: "manual",
          status: isAdvanced || saveOnly ? "draft" : "published",
          social_copy: String(copy.social_copy ?? ""),
          whatsapp_message: String(copy.whatsapp_message ?? ""),
          created_from: "telegram",
        })
        .select()
        .single();
      if (error) throw error;
      if (isAdvanced) {
        try {
          await saveAdvancedStructure(admin, event.id, advancedDraft);
        } catch (structureError) {
          await admin.from("events").delete().eq("id", event.id);
          throw structureError;
        }
      }
      await admin
        .from("conversation_states")
        .update({
          current_flow: null,
          collected_data: {},
          missing_fields: [],
          last_message: text,
        })
        .eq("telegram_chat_id", chatId);
      await sendTelegramMessage(
        chatId,
        isAdvanced || saveOnly
          ? `✅ Borrador guardado.\n\nHe creado ${advancedDraft.programs.length} modalidades, ${advancedDraft.periods.length} periodos y ${advancedDraft.prices.length} tarifas. Revísalo antes de publicar:\n${process.env.NEXT_PUBLIC_APP_URL}/dashboard/events/${event.id}`
          : `✅ Evento publicado.\n\nGestionar evento:\n${process.env.NEXT_PUBLIC_APP_URL}/dashboard/events/${event.id}\n\nEnlace de inscripción para participantes:\n${process.env.NEXT_PUBLIC_APP_URL}/events/${event.slug}/register`,
      );
      return NextResponse.json({ ok: true });
    }
    const existing: Record<string, unknown> =
      state?.current_flow === "creating_event" ||
      state?.current_flow === "awaiting_confirmation"
        ? (state.collected_data as Record<string, unknown>)
        : {};
    const parsed = await parseEventMessage(text, existing, imageDataUrl);
    if (parsed.intent === "unknown") {
      await sendTelegramMessage(
        chatId,
        "No estoy seguro de qué necesitas. Escribe “crear evento”, “mis eventos” o “ayuda”.",
      );
      return NextResponse.json({ ok: true });
    }
    const collected: Record<string, unknown> = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(parsed.event).filter(
          ([, v]) => v !== null && v !== undefined,
        ),
      ),
      social_copy: parsed.social_copy || existing.social_copy,
      whatsapp_message: parsed.whatsapp_message || existing.whatsapp_message,
      event_mode: parsed.event_mode ?? existing.event_mode ?? "simple",
      advanced: parsed.advanced ?? existing.advanced,
    };
    if (parsed.missing_fields.length) {
      await admin
        .from("conversation_states")
        .update({
          current_flow: "creating_event",
          collected_data: collected,
          missing_fields: parsed.missing_fields,
          last_message: text,
          updated_at: new Date().toISOString(),
        })
        .eq("telegram_chat_id", chatId);
      await sendTelegramMessage(
        chatId,
        `${imageDataUrl ? "He analizado el cartel. " : "Perfecto. "}Me faltan ${parsed.missing_fields.length} datos:\n${parsed.missing_fields.map((f) => `• ${fieldNames[f] ?? f}`).join("\n")}\n\nPuedes responder en un solo mensaje${parsed.event_mode === "advanced" ? " o enviar más carteles." : "."}`,
      );
      return NextResponse.json({ ok: true });
    }
    await admin
      .from("conversation_states")
      .update({
        current_flow: "awaiting_confirmation",
        collected_data: collected,
        missing_fields: [],
        last_message: text,
        updated_at: new Date().toISOString(),
      })
      .eq("telegram_chat_id", chatId);
    const advanced = advancedEventDraftSchema
      .catch({ programs: [], periods: [], prices: [], uncertainties: [] })
      .parse(collected.advanced);
    const isAdvanced = collected.event_mode === "advanced" || advanced.programs.length > 0;
    await sendTelegramMessage(
      chatId,
      isAdvanced
        ? `Listo. Detecté un campus avanzado:\n\n${collected.title}\n${collected.start_date} al ${collected.end_date}\n${collected.city}${collected.location ? ` · ${collected.location}` : ""}\n\nModalidades: ${advanced.programs.length}\nPeriodos: ${advanced.periods.length}\nTarifas: ${advanced.prices.length}${advanced.uncertainties.length ? `\n\n⚠️ Datos a revisar:\n${advanced.uncertainties.map((item) => `• ${item}`).join("\n")}` : ""}\n\nLo guardaré como borrador para revisar las tablas en el dashboard.`
        : `Listo. Te preparé este borrador:\n\n${collected.title}\n${collected.start_date} al ${collected.end_date}\n${collected.city}${collected.location ? ` · ${collected.location}` : ""}\n${collected.age_range ? `Edad: ${collected.age_range}\n` : ""}Precio: ${collected.price} €\nPlazas: ${collected.capacity}\n\nTambién preparé el copy para redes y WhatsApp.\n¿Quieres publicarlo ahora?`,
      isAdvanced
        ? [["Guardar borrador", "Cancelar"]]
        : [["Confirmar", "Guardar borrador"], ["Cancelar"]],
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error", error);
    await sendTelegramMessage(
      chatId,
      "Ha ocurrido un error. Inténtalo de nuevo en unos segundos.",
    ).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }
}

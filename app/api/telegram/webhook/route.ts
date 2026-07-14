import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseEventMessage } from "@/lib/event-parser";
import { createSlug } from "@/lib/slug";
import { eventSchema } from "@/lib/validations";
import { sendTelegramMessage, type TelegramUpdate } from "@/lib/telegram";
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
const yes = /^(sí|si|yes|publica|publícalo|publicar)$/i;
export async function POST(request: Request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (
    !process.env.TELEGRAM_WEBHOOK_SECRET ||
    secret !== process.env.TELEGRAM_WEBHOOK_SECRET
  )
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message?.text) return NextResponse.json({ ok: true });
  const chatId = String(message.chat.id);
  const text = message.text.trim().slice(0, 4000);
  const admin = createAdminClient();
  try {
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
    if (state?.current_flow === "awaiting_confirmation" && yes.test(text)) {
      const parsed = eventSchema.safeParse(state.collected_data);
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
      const copy = state.collected_data as Record<string, unknown>;
      const { data: event, error } = await admin
        .from("events")
        .insert({
          ...parsed.data,
          owner_id: profileId,
          organization_id: null,
          slug: createSlug(parsed.data.title),
          payment_mode: "manual",
          status: "published",
          social_copy: String(copy.social_copy ?? ""),
          whatsapp_message: String(copy.whatsapp_message ?? ""),
          created_from: "telegram",
        })
        .select()
        .single();
      if (error) throw error;
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
        `✅ Evento publicado.\nPuedes gestionarlo desde:\n${process.env.NEXT_PUBLIC_APP_URL}/dashboard/events/${event.id}`,
      );
      return NextResponse.json({ ok: true });
    }
    const existing: Record<string, unknown> =
      state?.current_flow === "creating_event"
        ? (state.collected_data as Record<string, unknown>)
        : {};
    const parsed = await parseEventMessage(text, existing);
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
        `Perfecto. Me faltan ${parsed.missing_fields.length} datos:\n${parsed.missing_fields.map((f) => `• ${fieldNames[f] ?? f}`).join("\n")}\n\nPuedes responder en un solo mensaje.`,
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
    await sendTelegramMessage(
      chatId,
      `Listo. Te preparé este borrador:\n\n${collected.title}\n${collected.start_date} al ${collected.end_date}\n${collected.city}${collected.location ? ` · ${collected.location}` : ""}\n${collected.age_range ? `Edad: ${collected.age_range}\n` : ""}Precio: ${collected.price} €\nPlazas: ${collected.capacity}\n\nTambién preparé el copy para redes y WhatsApp.\n¿Quieres publicarlo ahora?`,
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

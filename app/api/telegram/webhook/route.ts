import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseComplexPricingMessage,
  parseEventMessage,
} from "@/lib/event-parser";
import { createRegistrationTemplate } from "@/lib/forms/create-registration-template";
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
import {
  complexMenuKeyboard,
  complexSummary,
  getAdvancedDraft,
  handleComplexFlowStep,
  isComplexFlowName,
  pricingPreview,
  shouldUseComplexFlow,
} from "@/lib/telegram/complex-event-flow";
import { createOrUpdateProfile } from "@/lib/onboarding/create-or-update-profile";
import { createOrganization } from "@/lib/onboarding/create-organization";
import { createLocation } from "@/lib/onboarding/create-location";
import { completeOnboarding } from "@/lib/onboarding/complete-onboarding";
import { getOnboardingStatus } from "@/lib/onboarding/get-onboarding-status";
import { buildEventDefaults } from "@/lib/onboarding/event-defaults";
import {
  profileNeedsOrganization,
  type ProfileType,
} from "@/lib/onboarding/schema";
import {
  isTelegramOnboardingFlow,
  parseTelegramProfileType,
  telegramOnboardingSummary,
  telegramProfileTypeKeyboard,
} from "@/lib/onboarding/telegram-onboarding";
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
const yes =
  /^(sí|si|yes|publica|publícalo|publicar|confirmar|confirmar borrador|guardar borrador)$/i;

async function updateTelegramOnboardingState(
  admin: ReturnType<typeof createAdminClient>,
  chatId: string,
  flow: string | null,
  collected: Record<string, unknown>,
) {
  const { error } = await admin
    .from("conversation_states")
    .update({
      current_flow: flow,
      collected_data: collected,
      missing_fields: [],
      updated_at: new Date().toISOString(),
    })
    .eq("telegram_chat_id", chatId);
  if (error) throw error;
}

async function beginTelegramProfileOnboarding(
  admin: ReturnType<typeof createAdminClient>,
  chatId: string,
  profileId: string,
) {
  const status = await getOnboardingStatus(admin, profileId);
  const collected = {
    profile_type: status.profile.profile_type,
    full_name: status.profile.full_name,
    email: status.profile.email,
    phone: status.profile.phone,
    city: status.profile.city,
    country: status.profile.country ?? "España",
    organization_id: status.organization?.id,
    organization_name: status.organization?.name,
    location_name: status.defaultLocation?.name,
  };
  await updateTelegramOnboardingState(
    admin,
    chatId,
    "profile_onboarding_type",
    collected,
  );
  await sendTelegramMessage(
    chatId,
    "¡Bienvenido a WeMoot! ⚽\nAntes de crear tu primer evento necesito conocerte un poco.\n\n¿Cómo vas a utilizar WeMoot?",
    telegramProfileTypeKeyboard,
  );
}

async function showTelegramOnboardingSummary(
  admin: ReturnType<typeof createAdminClient>,
  chatId: string,
  collected: Record<string, unknown>,
) {
  await updateTelegramOnboardingState(
    admin,
    chatId,
    "profile_onboarding_summary",
    collected,
  );
  await sendTelegramMessage(chatId, telegramOnboardingSummary(collected), [
    ["Confirmar perfil"],
    ["Editar en la web", "Ahora no"],
  ]);
}

async function handleTelegramProfileOnboarding({
  admin,
  chatId,
  profileId,
  flow,
  collected,
  text,
  message,
}: {
  admin: ReturnType<typeof createAdminClient>;
  chatId: string;
  profileId: string;
  flow: string;
  collected: Record<string, unknown>;
  text: string;
  message: NonNullable<TelegramUpdate["message"]>;
}) {
  if (/^ahora no$/i.test(text) && flow === "profile_onboarding_summary") {
    await updateTelegramOnboardingState(admin, chatId, null, collected);
    await sendTelegramMessage(
      chatId,
      `Puedes continuar cuando quieras en ${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
    );
    return;
  }
  if (/^editar en la web$/i.test(text)) {
    await sendTelegramMessage(
      chatId,
      `Completa o edita tu perfil aquí:\n${process.env.NEXT_PUBLIC_APP_URL}/onboarding?edit=1`,
    );
    return;
  }
  if (flow === "profile_onboarding_type") {
    const profileType = parseTelegramProfileType(text);
    if (!profileType) {
      await sendTelegramMessage(
        chatId,
        "Elige una de las opciones.",
        telegramProfileTypeKeyboard,
      );
      return;
    }
    await createOrUpdateProfile(admin, profileId, {
      profile_type: profileType,
    });
    const next = { ...collected, profile_type: profileType };
    await updateTelegramOnboardingState(
      admin,
      chatId,
      "profile_onboarding_name",
      next,
    );
    await sendTelegramMessage(chatId, "¿Cuál es tu nombre completo?");
    return;
  }
  if (flow === "profile_onboarding_name") {
    if (text.length < 2) {
      await sendTelegramMessage(chatId, "Escribe tu nombre completo.");
      return;
    }
    await createOrUpdateProfile(admin, profileId, { full_name: text });
    const next = { ...collected, full_name: text };
    await updateTelegramOnboardingState(
      admin,
      chatId,
      "profile_onboarding_phone",
      next,
    );
    await sendTelegramMessage(
      chatId,
      "¿Quieres añadir un teléfono de contacto?",
      [
        [{ text: "Compartir mi teléfono", request_contact: true }],
        ["Escribirlo manualmente", "Ahora no"],
      ],
    );
    return;
  }
  if (
    flow === "profile_onboarding_phone" &&
    /^escribirlo manualmente$/i.test(text)
  ) {
    await updateTelegramOnboardingState(
      admin,
      chatId,
      "profile_onboarding_phone_manual",
      collected,
    );
    await sendTelegramMessage(
      chatId,
      "Escribe el teléfono con prefijo de país si corresponde.",
    );
    return;
  }
  if (
    flow === "profile_onboarding_phone" ||
    flow === "profile_onboarding_phone_manual"
  ) {
    const skipped = /^ahora no$/i.test(text);
    const phone = message.contact?.phone_number ?? (skipped ? null : text);
    if (phone && phone.length > 30) {
      await sendTelegramMessage(
        chatId,
        "El teléfono es demasiado largo. Inténtalo de nuevo.",
      );
      return;
    }
    if (phone) await createOrUpdateProfile(admin, profileId, { phone });
    const next = { ...collected, phone };
    const needsOrganization = profileNeedsOrganization(
      collected.profile_type as ProfileType,
    );
    await updateTelegramOnboardingState(
      admin,
      chatId,
      needsOrganization
        ? "profile_onboarding_organization"
        : "profile_onboarding_city",
      next,
    );
    await sendTelegramMessage(
      chatId,
      needsOrganization
        ? "¿Cómo se llama tu organización?"
        : "¿En qué ciudad organizas normalmente tus actividades?",
    );
    return;
  }
  if (flow === "profile_onboarding_organization") {
    if (text.length < 2) {
      await sendTelegramMessage(
        chatId,
        "Escribe el nombre de la organización.",
      );
      return;
    }
    const type = collected.profile_type as ProfileType;
    const organization = await createOrganization(admin, profileId, {
      name: text,
      type,
      contact_email: String(collected.email ?? "") || null,
      contact_phone: String(collected.phone ?? "") || null,
    });
    const next = {
      ...collected,
      organization_id: organization.id,
      organization_name: organization.name,
    };
    await updateTelegramOnboardingState(
      admin,
      chatId,
      "profile_onboarding_city",
      next,
    );
    await sendTelegramMessage(
      chatId,
      "¿En qué ciudad realizas normalmente tus actividades?",
    );
    return;
  }
  if (flow === "profile_onboarding_city") {
    if (text.length < 2) {
      await sendTelegramMessage(chatId, "Escribe una ciudad válida.");
      return;
    }
    await createOrUpdateProfile(admin, profileId, {
      city: text,
      country: String(collected.country ?? "España"),
      language: "es",
      timezone: "Europe/Madrid",
    });
    const next = {
      ...collected,
      city: text,
      country: collected.country ?? "España",
    };
    await updateTelegramOnboardingState(
      admin,
      chatId,
      "profile_onboarding_location",
      next,
    );
    await sendTelegramMessage(
      chatId,
      "¿Quieres guardar tu instalación habitual?",
      [
        [{ text: "Compartir ubicación", request_location: true }],
        ["Escribir dirección"],
        ["Completarlo en la web", "Ahora no"],
      ],
    );
    return;
  }
  if (flow === "profile_onboarding_location") {
    if (/^completarlo en la web$/i.test(text)) {
      await sendTelegramMessage(
        chatId,
        `Puedes añadirla aquí:\n${process.env.NEXT_PUBLIC_APP_URL}/onboarding?edit=1`,
      );
      await showTelegramOnboardingSummary(admin, chatId, collected);
      return;
    }
    if (/^ahora no$/i.test(text)) {
      await showTelegramOnboardingSummary(admin, chatId, collected);
      return;
    }
    if (/^escribir dirección$/i.test(text)) {
      await updateTelegramOnboardingState(
        admin,
        chatId,
        "profile_onboarding_address",
        collected,
      );
      await sendTelegramMessage(
        chatId,
        "Escribe la dirección de la instalación.",
      );
      return;
    }
    if (message.location) {
      const next = {
        ...collected,
        latitude: message.location.latitude,
        longitude: message.location.longitude,
      };
      await updateTelegramOnboardingState(
        admin,
        chatId,
        "profile_onboarding_location_name",
        next,
      );
      await sendTelegramMessage(chatId, "¿Cómo se llama esta instalación?");
      return;
    }
    await sendTelegramMessage(
      chatId,
      "Elige una opción o comparte la ubicación.",
    );
    return;
  }
  if (flow === "profile_onboarding_address") {
    const next = { ...collected, location_address: text };
    await updateTelegramOnboardingState(
      admin,
      chatId,
      "profile_onboarding_location_name",
      next,
    );
    await sendTelegramMessage(chatId, "¿Cómo se llama la instalación?");
    return;
  }
  if (flow === "profile_onboarding_location_name") {
    if (text.length < 2) {
      await sendTelegramMessage(chatId, "Escribe el nombre de la instalación.");
      return;
    }
    const location = await createLocation(admin, profileId, {
      organization_id:
        (collected.organization_id as string | undefined) ?? null,
      name: text,
      location_type: "sports_facility",
      address_line_1:
        (collected.location_address as string | undefined) ?? null,
      city: String(collected.city ?? "") || null,
      country: String(collected.country ?? "España"),
      latitude: (collected.latitude as number | undefined) ?? null,
      longitude: (collected.longitude as number | undefined) ?? null,
      is_default: true,
    });
    await showTelegramOnboardingSummary(admin, chatId, {
      ...collected,
      location_id: location.id,
      location_name: location.name,
    });
    return;
  }
  if (
    flow === "profile_onboarding_summary" &&
    /^confirmar perfil$/i.test(text)
  ) {
    await completeOnboarding(admin, profileId);
    await updateTelegramOnboardingState(admin, chatId, null, {});
    await sendTelegramMessage(
      chatId,
      "✅ Tu perfil está listo. Usaré estos datos como predeterminados cuando crees un evento.",
      [["Crear mi primer evento"], ["Editar perfil", "Ver dashboard"]],
    );
  }
}

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
  const programPeriods = (programs ?? []).flatMap((program) =>
    (periods ?? []).map((period) => {
      const source = draft.programs.find(
        (item) => item.name.toLowerCase() === program.name.toLowerCase(),
      );
      return {
        program_id: program.id,
        period_id: period.id,
        capacity: source?.capacity ?? 1,
      };
    }),
  );
  if (programPeriods.length) {
    const { error } = await admin
      .from("event_program_periods")
      .insert(programPeriods);
    if (error) throw error;
  }
  const prices = draft.prices.flatMap((price, position) => {
    const programId = programIds.get(price.program_name.toLowerCase());
    if (!programId) return [];
    return [
      {
        source: price,
        row: {
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
      },
    ];
  });
  if (prices.length) {
    const { data: insertedPrices, error } = await admin
      .from("event_prices")
      .insert(prices.map((price) => price.row))
      .select("id,position");
    if (error) throw error;
    const insertedByPosition = new Map(
      (insertedPrices ?? []).map((price) => [price.position, price.id]),
    );
    const ruleUpdates = await Promise.all(
      prices.map((price) => {
        const legacyPriceId = insertedByPosition.get(price.row.position);
        if (!legacyPriceId) return Promise.resolve({ error: null });
        return admin
          .from("event_price_rules")
          .update({
            pricing_type: price.source.pricing_type ?? "fixed",
            quantity_from: price.source.quantity_from ?? null,
            quantity_to: price.source.quantity_to ?? null,
          })
          .eq("legacy_price_id", legacyPriceId);
      }),
    );
    const updateError = ruleUpdates.find((result) => result.error)?.error;
    if (updateError) throw updateError;
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
  if (!Number.isSafeInteger(update.update_id))
    return NextResponse.json({ error: "Update no válido" }, { status: 400 });
  const message = update.message;
  if (
    !message ||
    (!message.text &&
      !message.caption &&
      !message.photo &&
      !message.document &&
      !message.contact &&
      !message.location)
  ) {
    return NextResponse.json({ ok: true });
  }
  const chatId = String(message.chat.id);
  const text = (
    message.text ??
    message.caption ??
    (message.contact ? message.contact.phone_number : undefined) ??
    (message.location ? "Ubicación compartida" : undefined) ??
    "Importar este cartel como borrador de evento avanzado"
  )
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
    if (state) {
      const { data: claimedState, error: claimError } = await admin
        .from("conversation_states")
        .update({ last_update_id: update.update_id })
        .eq("telegram_chat_id", chatId)
        .or(
          `last_update_id.is.null,last_update_id.lt.${Math.trunc(update.update_id)}`,
        )
        .select()
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimedState) return NextResponse.json({ ok: true });
      state = claimedState;
    }
    if (!account) {
      if (!state) {
        await admin.from("conversation_states").insert({
          telegram_chat_id: chatId,
          current_flow: "onboarding_email",
          collected_data: {},
          missing_fields: [],
          last_message: text,
          last_update_id: update.update_id,
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
        await beginTelegramProfileOnboarding(admin, chatId, profile.id);
        return NextResponse.json({ ok: true });
      }
    }
    if (!account) return NextResponse.json({ ok: true });
    const profileId = account.profile_id as string;
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
            last_update_id: update.update_id,
          })
          .select()
          .single()
      ).data;
    const onboardingStatus = await getOnboardingStatus(admin, profileId);
    if (text === "/start" && !onboardingStatus.completed) {
      await beginTelegramProfileOnboarding(admin, chatId, profileId);
      return NextResponse.json({ ok: true });
    }
    if (isTelegramOnboardingFlow(state?.current_flow)) {
      await handleTelegramProfileOnboarding({
        admin,
        chatId,
        profileId,
        flow: state.current_flow,
        collected: (state.collected_data ?? {}) as Record<string, unknown>,
        text,
        message,
      });
      return NextResponse.json({ ok: true });
    }
    if (/^crear mi primer evento$/i.test(text)) {
      await sendTelegramMessage(
        chatId,
        "Cuéntame qué quieres organizar. Por ejemplo: “Quiero crear un campus del 15 al 19 de julio”.",
      );
      return NextResponse.json({ ok: true });
    }
    if (/^editar perfil$/i.test(text)) {
      await sendTelegramMessage(
        chatId,
        `Edita tu perfil aquí:\n${process.env.NEXT_PUBLIC_APP_URL}/onboarding?edit=1`,
      );
      return NextResponse.json({ ok: true });
    }
    if (/^ver dashboard$/i.test(text)) {
      await sendTelegramMessage(
        chatId,
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      );
      return NextResponse.json({ ok: true });
    }
    if (text === "/start" || text.toLowerCase() === "ayuda") {
      await sendTelegramMessage(
        chatId,
        "Puedo crear eventos simples y campus con varias modalidades, semanas y precios.\n\nEjemplos:\n“Quiero crear un torneo el 15 de julio en Barcelona, 75 €, 40 plazas.”\n“Quiero crear un campus de tecnificación con actividades de mañana y tarde.”\n\nComandos: crear evento · mis eventos · ayuda",
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
    if (
      (state?.current_flow === "awaiting_confirmation" ||
        isComplexFlowName(state?.current_flow)) &&
      /^cancelar$/i.test(text)
    ) {
      await admin
        .from("conversation_states")
        .update({ current_flow: null, collected_data: {}, missing_fields: [] })
        .eq("telegram_chat_id", chatId);
      await sendTelegramMessage(
        chatId,
        "Borrador descartado. Puedes comenzar otro evento cuando quieras.",
      );
      return NextResponse.json({ ok: true });
    }
    if (isComplexFlowName(state?.current_flow)) {
      const existing = state.collected_data as Record<string, unknown>;
      const result = handleComplexFlowStep(state.current_flow, text, existing);
      if (result.action === "parse_pricing") {
        const programNames = getAdvancedDraft(existing).programs.map(
          (program) => program.name,
        );
        try {
          const interpreted = await parseComplexPricingMessage(
            text,
            programNames,
          );
          if (!interpreted.prices.length) {
            await sendTelegramMessage(
              chatId,
              `No encontré tarifas válidas.${interpreted.uncertainties.length ? `\n${interpreted.uncertainties.join("\n")}` : ""}\n\nDescríbelas de nuevo con importes y tipo de participante.`,
            );
            return NextResponse.json({ ok: true });
          }
          const advanced = getAdvancedDraft(existing);
          const pricingData = {
            ...existing,
            telegram_pending_prices: interpreted.prices,
            advanced: {
              ...advanced,
              uncertainties: [
                ...new Set([
                  ...advanced.uncertainties,
                  ...interpreted.uncertainties,
                ]),
              ],
            },
          };
          await admin
            .from("conversation_states")
            .update({
              current_flow: "complex_pricing_confirmation",
              collected_data: pricingData,
              last_message: text,
              updated_at: new Date().toISOString(),
            })
            .eq("telegram_chat_id", chatId);
          await sendTelegramMessage(
            chatId,
            `He interpretado estas tarifas:\n\n${pricingPreview(interpreted.prices).slice(0, 3500)}${interpreted.uncertainties.length ? `\n\n⚠️ Revisa:\n${interpreted.uncertainties.join("\n").slice(0, 350)}` : ""}`,
            [["Confirmar precios", "Editar precios"], ["Menú"]],
          );
        } catch {
          await sendTelegramMessage(
            chatId,
            "No pude interpretar esas tarifas. Comprueba que OpenAI esté configurado e inténtalo con importes claros.",
          );
        }
        return NextResponse.json({ ok: true });
      }
      if (result.action === "import") {
        const imported = await parseEventMessage(text, existing, imageDataUrl);
        const importedData: Record<string, unknown> = {
          ...existing,
          ...Object.fromEntries(
            Object.entries(imported.event).filter(
              ([, value]) => value !== null && value !== undefined,
            ),
          ),
          social_copy: imported.social_copy || existing.social_copy,
          whatsapp_message:
            imported.whatsapp_message || existing.whatsapp_message,
          event_mode: "advanced",
          advanced: imported.advanced ?? existing.advanced,
        };
        const nextFlow = imported.missing_fields.length
          ? "creating_event"
          : "complex_menu";
        await admin
          .from("conversation_states")
          .update({
            current_flow: nextFlow,
            collected_data: importedData,
            missing_fields: imported.missing_fields,
            last_message: text,
            updated_at: new Date().toISOString(),
          })
          .eq("telegram_chat_id", chatId);
        await sendTelegramMessage(
          chatId,
          imported.missing_fields.length
            ? `He incorporado la información. Aún faltan:\n${imported.missing_fields.map((field) => `• ${fieldNames[field] ?? field}`).join("\n")}`
            : `${imageDataUrl ? "Cartel analizado. " : "Información incorporada. "}${complexSummary(importedData)}\n\n¿Qué quieres configurar?`,
          imported.missing_fields.length ? undefined : complexMenuKeyboard,
        );
        return NextResponse.json({ ok: true });
      }
      await admin
        .from("conversation_states")
        .update({
          current_flow: result.flow,
          collected_data: result.collected,
          missing_fields: [],
          last_message: text,
          updated_at: new Date().toISOString(),
        })
        .eq("telegram_chat_id", chatId);
      await sendTelegramMessage(chatId, result.message, result.keyboard);
      return NextResponse.json({ ok: true });
    }
    if (state?.current_flow === "awaiting_confirmation" && yes.test(text)) {
      const collectedData = state.collected_data as Record<string, unknown>;
      const advancedDraft = advancedEventDraftSchema
        .catch({ programs: [], periods: [], prices: [], uncertainties: [] })
        .parse(collectedData.advanced);
      const isAdvanced = shouldUseComplexFlow(collectedData);
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
      const { data: organization } = await admin
        .from("organizations")
        .select("id")
        .eq("owner_id", profileId)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      const { data: event, error } = await admin
        .from("events")
        .insert({
          ...parsed.data,
          price: isAdvanced
            ? minimumPrice
            : (parsed.data as { price: number }).price,
          capacity: isAdvanced
            ? Math.max(totalCapacity, 1)
            : (parsed.data as { capacity: number }).capacity,
          ...(isAdvanced ? { event_mode: "advanced" } : {}),
          owner_id: profileId,
          organization_id: organization?.id ?? null,
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
          const template = collectedData.registration_template;
          if (
            template === "football_campus_full" ||
            template === "basic" ||
            template === "blank"
          )
            await createRegistrationTemplate(admin, event.id, template);
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
        ? {
            ...buildEventDefaults(onboardingStatus),
            ...(state.collected_data as Record<string, unknown>),
          }
        : buildEventDefaults(onboardingStatus);
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
    const advanced = advancedEventDraftSchema
      .catch({ programs: [], periods: [], prices: [], uncertainties: [] })
      .parse(collected.advanced);
    const isAdvanced = shouldUseComplexFlow(collected);
    await admin
      .from("conversation_states")
      .update({
        current_flow: isAdvanced ? "complex_menu" : "awaiting_confirmation",
        collected_data: collected,
        missing_fields: [],
        last_message: text,
        updated_at: new Date().toISOString(),
      })
      .eq("telegram_chat_id", chatId);
    await sendTelegramMessage(
      chatId,
      isAdvanced
        ? `Detecté un campus con varias opciones.\n\n${complexSummary(collected)}${advanced.uncertainties.length ? `\n\n⚠️ Datos a revisar:\n${advanced.uncertainties.map((item) => `• ${item}`).join("\n")}` : ""}\n\n¿Cómo quieres configurarlo?`
        : `Listo. Te preparé este borrador:\n\n${collected.title}\n${collected.start_date} al ${collected.end_date}\n${collected.city}${collected.location ? ` · ${collected.location}` : ""}\n${collected.age_range ? `Edad: ${collected.age_range}\n` : ""}Precio: ${collected.price} €\nPlazas: ${collected.capacity}\n\nTambién preparé el copy para redes y WhatsApp.\n¿Quieres publicarlo ahora?`,
      isAdvanced
        ? complexMenuKeyboard
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

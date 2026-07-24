import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attachStripeSession,
  cancelCapacity,
  confirmCapacity,
  reserveCapacity,
} from "@/lib/capacity/reservations";
import { sendRegistrationEmail } from "@/lib/email/registration-email";
import { calculateInvitationExpiry } from "@/lib/preregistration/domain";
import { getStripe } from "@/lib/stripe";

type QueueRegistration = {
  id: string;
  event_id: string;
  participant_name: string;
  participant_email: string | null;
  total_amount: number | null;
  currency: string | null;
  public_token: string;
  payment_expires_at: string | null;
  registration_status: string;
  payments:
    | { stripe_session_id: string | null }
    | Array<{ stripe_session_id: string | null }>
    | null;
  events:
    | { title: string; slug: string }
    | Array<{ title: string; slug: string }>
    | null;
  registration_programs: Array<{
    event_programs: { name: string } | Array<{ name: string }> | null;
  }> | null;
};

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const queueRegistrationSelect =
  "id,event_id,participant_name,participant_email,total_amount,currency,public_token,payment_expires_at,registration_status,payments(stripe_session_id),events(title,slug),registration_programs(event_programs(name))";

async function notifyParticipant(
  admin: SupabaseClient,
  registration: QueueRegistration,
  type: "payment_invitation" | "payment_expired",
) {
  await sendRegistrationEmail(admin, registration.id, type).catch(() => null);
}

async function createInvitationCheckout(
  admin: SupabaseClient,
  registration: QueueRegistration,
) {
  const event = first(registration.events);
  if (!event) throw new Error("Evento no encontrado");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const programNames = (registration.registration_programs ?? [])
    .map((selection) => first(selection.event_programs)?.name)
    .filter(Boolean)
    .join(" + ");
  const expiresAt = new Date(registration.payment_expires_at ?? "");
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    customer_email: registration.participant_email ?? undefined,
    client_reference_id: registration.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: String(registration.currency ?? "EUR").toLowerCase(),
          unit_amount: Math.round(Number(registration.total_amount ?? 0) * 100),
          product_data: {
            name: `Inscripción · ${event.title}${programNames ? ` · ${programNames}` : ""}`.slice(
              0,
              127,
            ),
          },
        },
      },
    ],
    metadata: {
      registration_id: registration.id,
      event_id: registration.event_id,
      preregistration: "true",
    },
    payment_intent_data: {
      metadata: {
        registration_id: registration.id,
        event_id: registration.event_id,
      },
    },
    success_url: `${appUrl}/events/${event.slug}/register/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pay/${registration.public_token}?cancelled=1`,
  });
  if (!session.url) throw new Error("Stripe no devolvió un enlace de pago");
  const { error } = await admin
    .from("payments")
    .update({ method: "stripe", stripe_session_id: session.id })
    .eq("registration_id", registration.id);
  if (error) throw error;
  await attachStripeSession(admin, registration.id, session.id);
}

async function selectionsForRegistration(
  admin: SupabaseClient,
  registrationId: string,
) {
  const [{ data: programs, error: programError }, { data: periods, error }] =
    await Promise.all([
      admin
        .from("registration_programs")
        .select("program_id")
        .eq("registration_id", registrationId),
      admin
        .from("registration_periods")
        .select("program_id,period_id")
        .eq("registration_id", registrationId),
    ]);
  if (programError || error) throw programError ?? error;
  return (programs ?? []).map((program) => ({
    programId: program.program_id as string,
    periodIds: (periods ?? [])
      .filter((period) => period.program_id === program.program_id)
      .map((period) => period.period_id as string),
  }));
}

export async function promoteWaitingList(
  admin: SupabaseClient,
  eventId: string,
) {
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id,registration_mode,payment_opened_at,payment_invitation_hours")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (
    !event ||
    event.registration_mode !== "preregistration" ||
    !event.payment_opened_at
  )
    return { invited: 0, waiting: 0 };

  const { data: candidates, error: candidatesError } = await admin
    .from("registrations")
    .select("id,event_id,participant_name")
    .eq("event_id", eventId)
    .in("registration_status", ["preregistered", "waitlisted"])
    .order("queue_position", { ascending: true });
  if (candidatesError) throw candidatesError;

  let invited = 0;
  let waiting = 0;
  for (const candidate of candidates ?? []) {
    const expiresAt = calculateInvitationExpiry(
      new Date(),
      Number(event.payment_invitation_hours ?? 24),
    ).toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("registrations")
      .update({
        registration_status: "pending_payment",
        payment_invited_at: new Date().toISOString(),
        payment_expires_at: expiresAt,
      })
      .eq("id", candidate.id)
      .in("registration_status", ["preregistered", "waitlisted"])
      .select(queueRegistrationSelect)
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    try {
      const selections = await selectionsForRegistration(admin, candidate.id);
      if (
        !selections.length ||
        selections.some((selection) => !selection.periodIds.length)
      )
        throw new Error("La preinscripción no tiene modalidades completas");
      for (const selection of selections)
        await reserveCapacity(admin, {
          eventId,
          programId: selection.programId,
          periodIds: selection.periodIds,
          registrationId: candidate.id,
          holdMinutes: Number(event.payment_invitation_hours ?? 24) * 60,
        });
      if (Number(claimed.total_amount ?? 0) <= 0) {
        await confirmCapacity(admin, candidate.id);
        const { error: freeError } = await admin
          .from("registrations")
          .update({
            registration_status: "confirmed",
            payment_status: "paid",
          })
          .eq("id", candidate.id)
          .eq("registration_status", "pending_payment");
        if (freeError) throw freeError;
        await admin
          .from("payments")
          .update({
            method: "free",
            status: "paid",
            paid_at: new Date().toISOString(),
          })
          .eq("registration_id", candidate.id);
        await sendRegistrationEmail(admin, candidate.id, "payment_confirmed");
        invited += 1;
        continue;
      }
      await createInvitationCheckout(admin, claimed as QueueRegistration);
      const { data: invitation, error: invitationError } = await admin
        .from("registrations")
        .update({ registration_status: "payment_invited" })
        .eq("id", candidate.id)
        .eq("registration_status", "pending_payment")
        .select(queueRegistrationSelect)
        .single();
      if (invitationError) throw invitationError;
      await admin
        .from("payments")
        .update({ method: "deferred", status: "pending" })
        .eq("registration_id", candidate.id);
      await notifyParticipant(
        admin,
        invitation as QueueRegistration,
        "payment_invitation",
      );
      invited += 1;
    } catch {
      const { data: payment } = await admin
        .from("payments")
        .select("stripe_session_id")
        .eq("registration_id", candidate.id)
        .maybeSingle();
      if (payment?.stripe_session_id)
        await getStripe()
          .checkout.sessions.expire(payment.stripe_session_id)
          .catch(() => null);
      await cancelCapacity(admin, candidate.id).catch(() => null);
      await admin
        .from("registrations")
        .update({
          registration_status: "waitlisted",
          payment_invited_at: null,
          payment_expires_at: null,
        })
        .eq("id", candidate.id)
        .eq("registration_status", "pending_payment");
      waiting += 1;
    }
  }
  return { invited, waiting };
}

export async function expirePaymentInvitations(
  admin: SupabaseClient,
  eventId?: string,
) {
  let query = admin
    .from("registrations")
    .select(queueRegistrationSelect)
    .in("registration_status", ["payment_invited", "pending_payment"])
    .lt("payment_expires_at", new Date().toISOString());
  if (eventId) query = query.eq("event_id", eventId);
  const { data: expired, error } = await query;
  if (error) throw error;

  const affectedEvents = new Set<string>();
  for (const registration of (expired ?? []) as QueueRegistration[]) {
    const sessionId = first(registration.payments)?.stripe_session_id;
    if (sessionId)
      await getStripe()
        .checkout.sessions.expire(sessionId)
        .catch(() => null);
    await cancelCapacity(admin, registration.id).catch(() => null);
    const { data: updated } = await admin
      .from("registrations")
      .update({
        registration_status: "expired",
        payment_status: "cancelled",
      })
      .eq("id", registration.id)
      .in("registration_status", ["payment_invited", "pending_payment"])
      .select("id")
      .maybeSingle();
    if (!updated) continue;
    await admin
      .from("payments")
      .update({ status: "cancelled" })
      .eq("registration_id", registration.id);
    await notifyParticipant(admin, registration, "payment_expired");
    affectedEvents.add(registration.event_id);
  }
  return {
    expired: affectedEvents.size ? (expired?.length ?? 0) : 0,
    eventIds: [...affectedEvents],
  };
}

export async function processPreregistrationQueues(
  admin: SupabaseClient,
  eventId?: string,
) {
  const expired = await expirePaymentInvitations(admin, eventId);
  const eventIds = new Set(expired.eventIds);
  if (eventId) eventIds.add(eventId);
  if (!eventId) {
    const { data: openEvents, error } = await admin
      .from("events")
      .select("id")
      .eq("registration_mode", "preregistration")
      .not("payment_opened_at", "is", null);
    if (error) throw error;
    for (const event of openEvents ?? []) eventIds.add(event.id);
  }
  let invited = 0;
  let waiting = 0;
  for (const id of eventIds) {
    const result = await promoteWaitingList(admin, id);
    invited += result.invited;
    waiting += result.waiting;
  }
  return { expired: expired.expired, invited, waiting };
}

export async function openEventPayments(
  admin: SupabaseClient,
  eventId: string,
) {
  const { error } = await admin
    .from("events")
    .update({ payment_opened_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("registration_mode", "preregistration");
  if (error) throw error;
  return processPreregistrationQueues(admin, eventId);
}

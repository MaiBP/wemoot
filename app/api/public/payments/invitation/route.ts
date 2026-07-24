import { NextResponse } from "next/server";
import { z } from "zod";
import { attachStripeSession } from "@/lib/capacity/reservations";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ token: z.uuid() });
const appUrl = (request: Request) =>
  (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    "",
  );

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Enlace no válido" }, { status: 400 });

  const admin = createAdminClient();
  const { data: registration, error } = await admin
    .from("registrations")
    .select(
      "id,event_id,participant_email,total_amount,currency,payment_status,registration_status,payment_expires_at,events(title,slug),registration_programs(event_programs(name)),payments(stripe_session_id)",
    )
    .eq("public_token", parsed.data.token)
    .maybeSingle();
  if (error) throw error;
  if (!registration)
    return NextResponse.json(
      { error: "Preinscripción no encontrada" },
      { status: 404 },
    );
  if (registration.payment_status === "paid")
    return NextResponse.json(
      { error: "Este pago ya está confirmado" },
      { status: 409 },
    );
  const expiresAt = registration.payment_expires_at
    ? new Date(registration.payment_expires_at)
    : null;
  if (
    !["payment_invited", "pending_payment"].includes(
      registration.registration_status,
    ) ||
    !expiresAt ||
    expiresAt.getTime() <= Date.now()
  )
    return NextResponse.json(
      { error: "La invitación de pago ha vencido" },
      { status: 410 },
    );

  const payment = Array.isArray(registration.payments)
    ? registration.payments[0]
    : registration.payments;
  if (payment?.stripe_session_id) {
    const existing = await getStripe()
      .checkout.sessions.retrieve(payment.stripe_session_id)
      .catch(() => null);
    if (existing?.status === "open" && existing.url)
      return NextResponse.json({ checkout_url: existing.url });
  }
  if (expiresAt.getTime() <= Date.now() + 30 * 60 * 1000)
    return NextResponse.json(
      {
        error:
          "Quedan menos de 30 minutos y no se pudo recuperar el pago. Contacta con la organización.",
      },
      { status: 409 },
    );

  const event = Array.isArray(registration.events)
    ? registration.events[0]
    : registration.events;
  const names = (registration.registration_programs ?? [])
    .map((selection) => {
      const program = Array.isArray(selection.event_programs)
        ? selection.event_programs[0]
        : selection.event_programs;
      return program?.name;
    })
    .filter(Boolean)
    .join(" + ");
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    expires_at: Math.min(
      Math.floor(expiresAt.getTime() / 1000),
      Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    ),
    customer_email: registration.participant_email ?? undefined,
    client_reference_id: registration.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: String(registration.currency ?? "EUR").toLowerCase(),
          unit_amount: Math.round(Number(registration.total_amount ?? 0) * 100),
          product_data: {
            name: `Inscripción · ${event?.title ?? "WeMoot"}${names ? ` · ${names}` : ""}`.slice(
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
    success_url: `${appUrl(request)}/events/${event?.slug}/register/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl(request)}/pay/${parsed.data.token}?cancelled=1`,
  });
  if (!session.url)
    return NextResponse.json(
      { error: "Stripe no devolvió un enlace de pago" },
      { status: 500 },
    );
  await Promise.all([
    admin
      .from("registrations")
      .update({ registration_status: "pending_payment" })
      .eq("id", registration.id)
      .eq("registration_status", "payment_invited"),
    admin
      .from("payments")
      .update({ method: "stripe", stripe_session_id: session.id })
      .eq("registration_id", registration.id),
    attachStripeSession(admin, registration.id, session.id),
  ]);
  return NextResponse.json({ checkout_url: session.url });
}

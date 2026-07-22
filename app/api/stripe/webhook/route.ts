import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelCapacity, confirmCapacity } from "@/lib/capacity/reservations";
import { getStripe } from "@/lib/stripe";

async function updatePayment(
  session: Stripe.Checkout.Session,
  status: "paid" | "cancelled",
) {
  const registrationId =
    session.metadata?.registration_id || session.client_reference_id;
  const eventId = session.metadata?.event_id;
  if (!registrationId || !eventId)
    throw new Error("Stripe session without WeMoot references");

  const admin = createAdminClient();
  const [{ data: registration, error: registrationError }, { data: payment }] =
    await Promise.all([
      admin
        .from("registrations")
        .select("id,event_id,program_id,total_amount,currency,payment_status")
        .eq("id", registrationId)
        .eq("event_id", eventId)
        .maybeSingle(),
      admin
        .from("payments")
        .select("id,amount,status")
        .eq("registration_id", registrationId)
        .eq("event_id", eventId)
        .maybeSingle(),
    ]);
  if (registrationError || !registration || !payment)
    throw registrationError ?? new Error("Registration or payment not found");

  if (status === "paid") {
    const expectedAmount = Math.round(
      Number(registration.total_amount ?? payment.amount) * 100,
    );
    if (
      session.amount_total !== expectedAmount ||
      session.currency?.toUpperCase() !==
        String(registration.currency ?? "EUR").toUpperCase()
    )
      throw new Error("Stripe payment amount or currency mismatch");
    if (registration.program_id) await confirmCapacity(admin, registrationId);
  } else {
    if (registration.program_id) await cancelCapacity(admin, registrationId);
  }

  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  const now = new Date().toISOString();
  const [registrationUpdate, paymentUpdate] = await Promise.all([
    admin
      .from("registrations")
      .update({
        payment_status: status,
        registration_status: status === "paid" ? "confirmed" : "cancelled",
      })
      .eq("id", registrationId)
      .eq("event_id", eventId),
    admin
      .from("payments")
      .update({
        status,
        method: "stripe",
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntent ?? null,
        paid_at: status === "paid" ? now : null,
        ...(session.amount_total !== null
          ? { amount: session.amount_total / 100 }
          : {}),
      })
      .eq("registration_id", registrationId)
      .eq("event_id", eventId),
  ]);
  const updateError = registrationUpdate.error ?? paymentUpdate.error;
  if (updateError) throw updateError;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret)
    return NextResponse.json(
      { error: "Webhook no configurado" },
      { status: 400 },
    );

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    );
  } catch (error) {
    console.error(
      "Stripe webhook signature error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  try {
    const session = event.data.object as Stripe.Checkout.Session;
    if (
      (event.type === "checkout.session.completed" &&
        session.payment_status === "paid") ||
      event.type === "checkout.session.async_payment_succeeded"
    )
      await updatePayment(session, "paid");
    else if (event.type === "checkout.session.expired")
      await updatePayment(session, "cancelled");
  } catch (error) {
    console.error(
      "Stripe webhook processing error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "No se pudo procesar el evento" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

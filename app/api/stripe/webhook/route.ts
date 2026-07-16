import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

async function updatePayment(session: Stripe.Checkout.Session, status: "paid" | "cancelled") {
  const registrationId = session.metadata?.registration_id;
  const eventId = session.metadata?.event_id;
  if (!registrationId || !eventId) return;

  const admin = createAdminClient();
  await Promise.all([
    admin.from("registrations").update({ payment_status: status }).eq("id", registrationId).eq("event_id", eventId),
    admin.from("payments").update({
      status,
      method: "stripe",
      ...(session.amount_total !== null ? { amount: session.amount_total / 100 } : {}),
    }).eq("registration_id", registrationId).eq("event_id", eventId),
  ]);
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature error", error);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (
    (event.type === "checkout.session.completed" && session.payment_status === "paid") ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    await updatePayment(session, "paid");
  } else if (event.type === "checkout.session.expired") {
    await updatePayment(session, "cancelled");
  }

  return NextResponse.json({ received: true });
}

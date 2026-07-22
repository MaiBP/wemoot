import { NextResponse } from "next/server";
import { cancelCapacity } from "@/lib/capacity/reservations";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isValidStripeCancelToken } from "@/lib/stripe";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const registrationId = url.searchParams.get("registration_id") ?? "";
  const eventSlug = url.searchParams.get("event") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const destination = new URL(
    `/events/${encodeURIComponent(eventSlug)}/register?payment=cancelled`,
    url.origin,
  );

  if (
    !registrationId ||
    !eventSlug ||
    !token ||
    !isValidStripeCancelToken(registrationId, token)
  )
    return NextResponse.redirect(destination);

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("stripe_session_id")
    .eq("registration_id", registrationId)
    .eq("status", "pending")
    .maybeSingle();
  if (payment) {
    if (payment.stripe_session_id) {
      try {
        await getStripe().checkout.sessions.expire(payment.stripe_session_id);
      } catch {
        // Stripe también notificará si la sesión ya no está abierta.
      }
    }
    await cancelCapacity(admin, registrationId);
    await Promise.all([
      admin
        .from("registrations")
        .update({
          payment_status: "cancelled",
          registration_status: "cancelled",
        })
        .eq("id", registrationId)
        .eq("payment_status", "pending"),
      admin
        .from("payments")
        .update({ status: "cancelled" })
        .eq("registration_id", registrationId)
        .eq("status", "pending"),
    ]);
  }
  return NextResponse.redirect(destination);
}

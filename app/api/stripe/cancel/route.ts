import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidStripeCancelToken } from "@/lib/stripe";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const registrationId = url.searchParams.get("registration_id") ?? "";
  const eventSlug = url.searchParams.get("event") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const destination = new URL(`/events/${encodeURIComponent(eventSlug)}/register?payment=cancelled`, url.origin);

  if (!registrationId || !eventSlug || !token || !isValidStripeCancelToken(registrationId, token)) {
    return NextResponse.redirect(destination);
  }

  const admin = createAdminClient();
  await Promise.all([
    admin.from("registrations").update({ payment_status: "cancelled" }).eq("id", registrationId).eq("payment_status", "pending"),
    admin.from("payments").update({ status: "cancelled" }).eq("registration_id", registrationId).eq("status", "pending"),
  ]);
  return NextResponse.redirect(destination);
}

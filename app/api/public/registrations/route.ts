import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeCancelToken, getStripe } from "@/lib/stripe";
import { publicRegistrationSchema, registrationSchema } from "@/lib/validations";

function appUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = publicRegistrationSchema.safeParse(body);
    if (!parsed.success || parsed.data.website) {
      return NextResponse.json({ error: "Revisa los datos del formulario." }, { status: 400 });
    }

    const payment_method = parsed.data.payment_method;
    const registration = registrationSchema.parse(parsed.data);
    const admin = createAdminClient();
    const { data: event } = await admin
      .from("events")
      .select("id, title, slug, price, capacity, status")
      .eq("id", registration.event_id)
      .eq("status", "published")
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: "Este evento no está disponible." }, { status: 404 });
    }

    const { count } = await admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .neq("payment_status", "cancelled");

    if ((count ?? 0) >= event.capacity) {
      return NextResponse.json({ error: "Ya no quedan plazas disponibles." }, { status: 409 });
    }

    const { data: duplicate } = await admin
      .from("registrations")
      .select("id")
      .eq("event_id", event.id)
      .ilike("participant_email", parsed.data.participant_email)
      .neq("payment_status", "cancelled")
      .maybeSingle();

    if (duplicate) {
      return NextResponse.json({ error: "Este email ya está inscrito en el evento." }, { status: 409 });
    }

    const isFree = Number(event.price) === 0;
    const { data: created, error: registrationError } = await admin
      .from("registrations")
      .insert({ ...registration, payment_status: isFree ? "paid" : "pending" })
      .select("id")
      .single();
    if (registrationError) throw registrationError;

    const method = isFree ? "free" : payment_method === "cash" ? "cash" : "stripe";
    const { error: paymentError } = await admin.from("payments").insert({
      registration_id: created.id,
      event_id: event.id,
      amount: event.price,
      status: isFree ? "paid" : "pending",
      method,
    });
    if (paymentError) {
      await admin.from("registrations").delete().eq("id", created.id);
      throw paymentError;
    }

    if (isFree || payment_method === "cash") {
      return NextResponse.json({
        success_url: `${appUrl(request)}/events/${event.slug}/register/success?method=${isFree ? "free" : "cash"}`,
      });
    }

    try {
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        customer_email: parsed.data.participant_email,
        client_reference_id: created.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: Math.round(Number(event.price) * 100),
              product_data: { name: `Inscripción · ${event.title}` },
            },
          },
        ],
        metadata: { registration_id: created.id, event_id: event.id },
        payment_intent_data: { metadata: { registration_id: created.id, event_id: event.id } },
        success_url: `${appUrl(request)}/events/${event.slug}/register/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl(request)}/api/stripe/cancel?registration_id=${created.id}&event=${encodeURIComponent(event.slug)}&token=${createStripeCancelToken(created.id)}`,
      });

      if (!session.url) throw new Error("Stripe no devolvió una URL de Checkout");
      return NextResponse.json({ checkout_url: session.url });
    } catch (error) {
      await admin.from("registrations").delete().eq("id", created.id);
      throw error;
    }
  } catch (error) {
    console.error("Public registration error", error);
    return NextResponse.json(
      { error: "No pudimos completar la inscripción. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}

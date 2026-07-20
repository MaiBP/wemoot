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
      .select("*")
      .eq("id", registration.event_id)
      .eq("status", "published")
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: "Este evento no está disponible." }, { status: 404 });
    }

    let amount = Number(event.price);
    let selectedProgram: { id: string; name: string; capacity: number; payment_timing: string; min_age: number | null; max_age: number | null } | null = null;
    let participantAge: number | null = null;
    let selectedPeriodId: string | null = null;
    if (event.event_mode === "advanced") {
      if (!parsed.data.program_id || !parsed.data.price_id) {
        return NextResponse.json({ error: "Selecciona una modalidad y una tarifa." }, { status: 400 });
      }
      const [{ data: program }, { data: selectedPrice }] = await Promise.all([
        admin.from("event_programs").select("id,name,capacity,payment_timing,min_age,max_age").eq("id", parsed.data.program_id).eq("event_id", event.id).eq("active", true).maybeSingle(),
        admin.from("event_prices").select("id,program_id,period_id,audience,amount,label").eq("id", parsed.data.price_id).eq("event_id", event.id).eq("active", true).maybeSingle(),
      ]);
      if (!program || !selectedPrice || selectedPrice.program_id !== program.id) {
        return NextResponse.json({ error: "La modalidad o tarifa ya no está disponible." }, { status: 409 });
      }
      if (!parsed.data.participant_birth_date || !parsed.data.guardian_name) {
        return NextResponse.json({ error: "Indica la fecha de nacimiento y el tutor del participante." }, { status: 400 });
      }
      const birthDate = new Date(`${parsed.data.participant_birth_date}T00:00:00Z`);
      const eventDate = new Date(`${event.start_date}T00:00:00Z`);
      participantAge = eventDate.getUTCFullYear() - birthDate.getUTCFullYear();
      if (
        eventDate.getUTCMonth() < birthDate.getUTCMonth() ||
        (eventDate.getUTCMonth() === birthDate.getUTCMonth() && eventDate.getUTCDate() < birthDate.getUTCDate())
      ) participantAge -= 1;
      if ((program.min_age != null && participantAge < program.min_age) || (program.max_age != null && participantAge > program.max_age)) {
        return NextResponse.json({ error: "La edad del participante no corresponde a esta modalidad." }, { status: 400 });
      }
      const expectedAudience = parsed.data.club_member ? "member" : "non_member";
      if (selectedPrice.audience !== "all" && selectedPrice.audience !== expectedAudience) {
        return NextResponse.json({ error: "La tarifa no corresponde al tipo de participante." }, { status: 400 });
      }
      selectedPeriodId = selectedPrice.period_id ?? parsed.data.period_id ?? null;
      if (selectedPeriodId) {
        const { data: period } = await admin.from("event_periods").select("id").eq("id", selectedPeriodId).eq("event_id", event.id).eq("active", true).maybeSingle();
        if (!period) return NextResponse.json({ error: "El periodo ya no está disponible." }, { status: 409 });
      }
      let capacityQuery = admin
        .from("registration_items")
        .select("id, registrations!inner(payment_status)", { count: "exact", head: true })
        .eq("program_id", program.id)
        .neq("registrations.payment_status", "cancelled");
      if (selectedPeriodId) capacityQuery = capacityQuery.eq("period_id", selectedPeriodId);
      const { count: programCount } = await capacityQuery;
      if ((programCount ?? 0) >= program.capacity) {
        return NextResponse.json({ error: "No quedan plazas para esta modalidad y periodo." }, { status: 409 });
      }
      amount = Number(selectedPrice.amount);
      selectedProgram = program;
    } else {
      const { count } = await admin
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .neq("payment_status", "cancelled");
      if ((count ?? 0) >= event.capacity) {
        return NextResponse.json({ error: "Ya no quedan plazas disponibles." }, { status: 409 });
      }
    }

    const { data: duplicate } = await admin
      .from("registrations")
      .select("id")
      .eq("event_id", event.id)
      .ilike("participant_email", parsed.data.participant_email)
      .ilike("participant_name", registration.participant_name)
      .neq("payment_status", "cancelled")
      .maybeSingle();

    if (duplicate) {
      return NextResponse.json({ error: "Este email ya está inscrito en el evento." }, { status: 409 });
    }

    const isFree = amount === 0;
    const requiresPaymentNow = !selectedProgram || selectedProgram.payment_timing === "immediate";
    const { data: created, error: registrationError } = await admin
      .from("registrations")
      .insert({
        ...registration,
        participant_age: participantAge ?? registration.participant_age ?? null,
        participant_birth_date: parsed.data.participant_birth_date ?? null,
        guardian_name: parsed.data.guardian_name ?? null,
        club_member: parsed.data.club_member ?? null,
        current_club: parsed.data.current_club ?? null,
        shirt_size: parsed.data.shirt_size ?? null,
        allergies: parsed.data.allergies ?? null,
        medical_notes: parsed.data.medical_notes ?? null,
        image_consent: parsed.data.image_consent,
        registration_status: requiresPaymentNow ? "confirmed" : "requested",
        payment_status: isFree ? "paid" : "pending",
      })
      .select("id")
      .single();
    if (registrationError) throw registrationError;

    if (selectedProgram && parsed.data.price_id) {
      const { error: itemError } = await admin.from("registration_items").insert({
        registration_id: created.id,
        event_id: event.id,
        program_id: selectedProgram.id,
        period_id: selectedPeriodId,
        price_id: parsed.data.price_id,
        amount,
      });
      if (itemError) {
        await admin.from("registrations").delete().eq("id", created.id);
        throw itemError;
      }
    }

    const method = isFree ? "free" : !requiresPaymentNow ? "reserve" : payment_method === "cash" ? "cash" : "stripe";
    const { error: paymentError } = await admin.from("payments").insert({
      registration_id: created.id,
      event_id: event.id,
      amount,
      status: isFree ? "paid" : "pending",
      method,
    });
    if (paymentError) {
      await admin.from("registrations").delete().eq("id", created.id);
      throw paymentError;
    }

    if (isFree || !requiresPaymentNow || payment_method === "cash") {
      return NextResponse.json({
        success_url: `${appUrl(request)}/events/${event.slug}/register/success?method=${isFree ? "free" : !requiresPaymentNow ? "reserve" : "cash"}`,
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
              unit_amount: Math.round(amount * 100),
              product_data: { name: `Inscripción · ${event.title}${selectedProgram ? ` · ${selectedProgram.name}` : ""}` },
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

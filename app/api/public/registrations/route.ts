import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeCancelToken, getStripe } from "@/lib/stripe";
import {
  attachStripeSession,
  CapacityError,
  confirmCapacity,
  reserveCapacity,
  STRIPE_CHECKOUT_MINUTES,
} from "@/lib/capacity/reservations";
import { PricingError } from "@/lib/pricing/calculate-price";
import {
  calculateRegistrationPrice,
  type CalculatePriceInput,
} from "@/lib/pricing/calculate-registration-price";
import {
  publicRegistrationSchema,
  registrationSchema,
} from "@/lib/validations";

function appUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  ).replace(/\/$/, "");
}

export async function POST(request: Request) {
  const admin = createAdminClient();
  let createdId: string | null = null;
  try {
    const body = await request.json();
    const parsed = publicRegistrationSchema.safeParse(body);
    if (!parsed.success || parsed.data.website) {
      return NextResponse.json(
        { error: "Revisa los datos del formulario." },
        { status: 400 },
      );
    }

    const payment_method = parsed.data.payment_method;
    const registration = registrationSchema.parse(parsed.data);
    const { data: event } = await admin
      .from("events")
      .select("*")
      .eq("id", registration.event_id)
      .eq("status", "published")
      .maybeSingle();

    if (!event) {
      return NextResponse.json(
        { error: "Este evento no está disponible." },
        { status: 404 },
      );
    }

    let amount = Number(event.price);
    let selectedProgram: {
      id: string;
      name: string;
      capacity: number;
      payment_timing: string;
      min_age: number | null;
      max_age: number | null;
      min_birth_year: number | null;
      max_birth_year: number | null;
    } | null = null;
    let participantAge: number | null = null;
    let selectedPeriodId: string | null = null;
    let participantType = "general";
    let priceCalculation: Awaited<
      ReturnType<typeof calculateRegistrationPrice>
    > | null = null;
    if (event.event_mode === "advanced") {
      if (!parsed.data.program_id || !parsed.data.price_id) {
        return NextResponse.json(
          { error: "Selecciona una modalidad y una tarifa." },
          { status: 400 },
        );
      }
      const [{ data: program }, { data: selectedPrice }] = await Promise.all([
        admin
          .from("event_programs")
          .select(
            "id,name,capacity,payment_timing,min_age,max_age,min_birth_year,max_birth_year",
          )
          .eq("id", parsed.data.program_id)
          .eq("event_id", event.id)
          .eq("active", true)
          .maybeSingle(),
        admin
          .from("event_prices")
          .select("id,program_id,period_id,audience,amount,label")
          .eq("id", parsed.data.price_id)
          .eq("event_id", event.id)
          .eq("active", true)
          .maybeSingle(),
      ]);
      if (
        !program ||
        !selectedPrice ||
        selectedPrice.program_id !== program.id
      ) {
        return NextResponse.json(
          { error: "La modalidad o tarifa ya no está disponible." },
          { status: 409 },
        );
      }
      if (!parsed.data.participant_birth_date || !parsed.data.guardian_name) {
        return NextResponse.json(
          {
            error: "Indica la fecha de nacimiento y el tutor del participante.",
          },
          { status: 400 },
        );
      }
      const birthDate = new Date(
        `${parsed.data.participant_birth_date}T00:00:00Z`,
      );
      const eventDate = new Date(`${event.start_date}T00:00:00Z`);
      participantAge = eventDate.getUTCFullYear() - birthDate.getUTCFullYear();
      if (
        eventDate.getUTCMonth() < birthDate.getUTCMonth() ||
        (eventDate.getUTCMonth() === birthDate.getUTCMonth() &&
          eventDate.getUTCDate() < birthDate.getUTCDate())
      )
        participantAge -= 1;
      if (
        (program.min_age != null && participantAge < program.min_age) ||
        (program.max_age != null && participantAge > program.max_age)
      ) {
        return NextResponse.json(
          {
            error: "La edad del participante no corresponde a esta modalidad.",
          },
          { status: 400 },
        );
      }
      const birthYear = birthDate.getUTCFullYear();
      if (
        (program.min_birth_year != null &&
          birthYear < program.min_birth_year) ||
        (program.max_birth_year != null && birthYear > program.max_birth_year)
      ) {
        return NextResponse.json(
          { error: "El año de nacimiento no corresponde a esta modalidad." },
          { status: 400 },
        );
      }
      const expectedAudience = parsed.data.club_member
        ? "member"
        : "non_member";
      participantType = expectedAudience;
      if (
        selectedPrice.audience !== "all" &&
        selectedPrice.audience !== expectedAudience
      ) {
        return NextResponse.json(
          { error: "La tarifa no corresponde al tipo de participante." },
          { status: 400 },
        );
      }
      selectedPeriodId =
        selectedPrice.period_id ?? parsed.data.period_id ?? null;
      if (!selectedPeriodId) {
        return NextResponse.json(
          { error: "Selecciona una semana o periodo." },
          { status: 400 },
        );
      } else {
        const { data: period } = await admin
          .from("event_periods")
          .select("id")
          .eq("id", selectedPeriodId)
          .eq("event_id", event.id)
          .eq("active", true)
          .maybeSingle();
        if (!period)
          return NextResponse.json(
            { error: "El periodo ya no está disponible." },
            { status: 409 },
          );
      }
      let effectiveCapacity = program.capacity;
      if (selectedPeriodId) {
        const { data: availability } = await admin
          .from("event_program_periods")
          .select("capacity,is_available")
          .eq("program_id", program.id)
          .eq("period_id", selectedPeriodId)
          .maybeSingle();
        if (!availability?.is_available) {
          return NextResponse.json(
            {
              error:
                "Esta modalidad no está disponible en el periodo seleccionado.",
            },
            { status: 409 },
          );
        }
        effectiveCapacity = availability.capacity ?? program.capacity;
      }
      let capacityQuery = admin
        .from("registration_items")
        .select("id, registrations!inner(payment_status)", {
          count: "exact",
          head: true,
        })
        .eq("program_id", program.id)
        .neq("registrations.payment_status", "cancelled");
      if (selectedPeriodId)
        capacityQuery = capacityQuery.eq("period_id", selectedPeriodId);
      const { count: programCount } = await capacityQuery;
      if ((programCount ?? 0) >= effectiveCapacity) {
        return NextResponse.json(
          { error: "No quedan plazas para esta modalidad y periodo." },
          { status: 409 },
        );
      }
      const priceInput: CalculatePriceInput = {
        eventId: event.id,
        programId: program.id,
        periodIds: [selectedPeriodId],
        participantType: expectedAudience,
        discountCode: parsed.data.discount_code ?? undefined,
        legacyPriceId: selectedPrice.id,
      };
      priceCalculation = await calculateRegistrationPrice(priceInput, admin);
      amount = priceCalculation.finalAmount / 100;
      selectedProgram = program;
    } else {
      const { count } = await admin
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .neq("payment_status", "cancelled");
      if ((count ?? 0) >= event.capacity) {
        return NextResponse.json(
          { error: "Ya no quedan plazas disponibles." },
          { status: 409 },
        );
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
      return NextResponse.json(
        { error: "Este email ya está inscrito en el evento." },
        { status: 409 },
      );
    }

    const isFree = amount === 0;
    const requiresPaymentNow =
      !selectedProgram || selectedProgram.payment_timing === "immediate";
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
        program_id: selectedProgram?.id ?? null,
        participant_type: participantType,
        total_amount: amount,
        currency: priceCalculation?.currency ?? event.currency ?? "EUR",
        submitted_at: new Date().toISOString(),
        registration_status:
          requiresPaymentNow && payment_method === "card" && !isFree
            ? "pending_payment"
            : requiresPaymentNow
              ? "confirmed"
              : "requested",
        payment_status: isFree ? "paid" : "pending",
      })
      .select("id")
      .single();
    if (registrationError) throw registrationError;
    createdId = created.id;

    if (priceCalculation) {
      const { error: snapshotError } = await admin
        .from("registration_price_snapshots")
        .insert({
          registration_id: created.id,
          calculation: priceCalculation,
          base_amount: priceCalculation.baseAmount,
          discount_amount: priceCalculation.discounts.reduce(
            (total, discount) => total + discount.amount,
            0,
          ),
          final_amount: priceCalculation.finalAmount,
          currency: priceCalculation.currency,
        });
      if (snapshotError) {
        await admin.from("registrations").delete().eq("id", created.id);
        throw snapshotError;
      }
      if (priceCalculation.discounts.length) {
        const { error: discountUseError } = await admin
          .from("registration_discount_uses")
          .insert(
            priceCalculation.discounts.map((discount) => ({
              registration_id: created.id,
              discount_id: discount.id,
              amount: discount.amount,
            })),
          );
        if (discountUseError) {
          await admin.from("registrations").delete().eq("id", created.id);
          if (discountUseError.message.includes("límite de usos")) {
            throw new PricingError(
              "INVALID_DISCOUNT",
              "El código de descuento ha alcanzado su límite de usos.",
            );
          }
          throw discountUseError;
        }
      }
    }

    if (selectedProgram && parsed.data.price_id) {
      const { error: itemError } = await admin
        .from("registration_items")
        .insert({
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

    const method = isFree
      ? "free"
      : !requiresPaymentNow
        ? "reserve"
        : payment_method === "cash"
          ? "cash"
          : "stripe";
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

    if (selectedProgram && selectedPeriodId) {
      await reserveCapacity(admin, {
        eventId: event.id,
        programId: selectedProgram.id,
        periodIds: [selectedPeriodId],
        registrationId: created.id,
      });
    }

    if (isFree || !requiresPaymentNow || payment_method === "cash") {
      if (selectedProgram) await confirmCapacity(admin, created.id);
      return NextResponse.json({
        success_url: `${appUrl(request)}/events/${event.slug}/register/success?method=${isFree ? "free" : !requiresPaymentNow ? "reserve" : "cash"}`,
      });
    }

    let stripeSessionId: string | null = null;
    try {
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        expires_at:
          Math.floor(Date.now() / 1000) + STRIPE_CHECKOUT_MINUTES * 60,
        customer_email: parsed.data.participant_email,
        client_reference_id: created.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: (
                priceCalculation?.currency ??
                event.currency ??
                "EUR"
              ).toLowerCase(),
              unit_amount:
                priceCalculation?.finalAmount ?? Math.round(amount * 100),
              product_data: {
                name: `Inscripción · ${event.title}${selectedProgram ? ` · ${selectedProgram.name}` : ""}`,
              },
            },
          },
        ],
        metadata: { registration_id: created.id, event_id: event.id },
        payment_intent_data: {
          metadata: { registration_id: created.id, event_id: event.id },
        },
        success_url: `${appUrl(request)}/events/${event.slug}/register/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl(request)}/api/stripe/cancel?registration_id=${created.id}&event=${encodeURIComponent(event.slug)}&token=${createStripeCancelToken(created.id)}`,
      });

      if (!session.url)
        throw new Error("Stripe no devolvió una URL de Checkout");
      stripeSessionId = session.id;
      const { error: stripeReferenceError } = await admin
        .from("payments")
        .update({ stripe_session_id: session.id })
        .eq("registration_id", created.id);
      if (stripeReferenceError) throw stripeReferenceError;
      if (selectedProgram)
        await attachStripeSession(admin, created.id, session.id);
      return NextResponse.json({ checkout_url: session.url });
    } catch (error) {
      if (stripeSessionId) {
        try {
          await getStripe().checkout.sessions.expire(stripeSessionId);
        } catch {
          // La inscripción se elimina a continuación.
        }
      }
      await admin.from("registrations").delete().eq("id", created.id);
      throw error;
    }
  } catch (error) {
    if (createdId)
      await admin.from("registrations").delete().eq("id", createdId);
    if (error instanceof PricingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CapacityError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Public registration error", error);
    return NextResponse.json(
      { error: "No pudimos completar la inscripción. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}

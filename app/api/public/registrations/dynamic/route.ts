import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { dynamicRegistrationSchema } from "@/lib/validations";
import { PricingError } from "@/lib/pricing/calculate-price";
import { calculateRegistrationPrice } from "@/lib/pricing/calculate-registration-price";
import { createStripeCancelToken, getStripe } from "@/lib/stripe";
import {
  attachStripeSession,
  CapacityError,
  confirmCapacity,
  reserveCapacity,
  STRIPE_CHECKOUT_MINUTES,
} from "@/lib/capacity/reservations";
import {
  validateParticipant,
  validateRequiredAnswers,
} from "@/lib/forms/validate-registration";
import { sendRegistrationEmail } from "@/lib/email/registration-email";
import { partitionRegistrationAnswers } from "@/lib/forms/partition-answers";

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const appUrl = (request: Request) =>
  (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    "",
  );

export async function POST(request: Request) {
  const admin = createAdminClient();
  let createdId: string | null = null;
  let createdStripeSessionId: string | null = null;
  try {
    const parsed = dynamicRegistrationSchema.safeParse(await request.json());
    if (!parsed.success || parsed.data.website)
      return NextResponse.json(
        { error: "Revisa los datos del formulario" },
        { status: 400 },
      );
    const input = parsed.data;
    const [{ data: event }, { data: form }, { data: program }] =
      await Promise.all([
        admin
          .from("events")
          .select("*")
          .eq("id", input.event_id)
          .eq("status", "published")
          .maybeSingle(),
        admin
          .from("registration_forms")
          .select("*")
          .eq("id", input.form_id)
          .eq("event_id", input.event_id)
          .eq("status", "published")
          .maybeSingle(),
        admin
          .from("event_programs")
          .select("*")
          .eq("id", input.program_id)
          .eq("event_id", input.event_id)
          .eq("active", true)
          .maybeSingle(),
      ]);
    if (!event || !form || !program)
      return NextResponse.json(
        { error: "El evento, formulario o programa ya no está disponible" },
        { status: 409 },
      );
    const { data: fields, error: fieldsError } = await admin
      .from("registration_form_fields")
      .select("*, registration_form_sections!inner(is_active,section_key)")
      .eq("form_id", form.id)
      .eq("is_active", true)
      .eq("registration_form_sections.is_active", true);
    if (fieldsError) throw fieldsError;
    const answers = input.answers;
    const requiredErrors = validateRequiredAnswers(
      (fields ?? []).map((field) => ({
        ...field,
        section_key: field.registration_form_sections?.section_key,
      })),
      answers,
    );
    if (requiredErrors.length)
      return NextResponse.json({ error: requiredErrors[0] }, { status: 400 });
    for (const field of fields ?? []) {
      const logic = field.conditional_logic as {
        field?: string;
        equals?: unknown;
      };
      const visible = !logic.field || answers[logic.field] === logic.equals;
      const value = answers[field.field_key];
      if (
        visible &&
        field.field_type === "email" &&
        value &&
        !z.email().safeParse(value).success
      )
        return NextResponse.json(
          { error: `Email no válido: ${field.label}` },
          { status: 400 },
        );
    }
    const birthDateValue = text(answers.participant_birth_date);
    const participantValidation = validateParticipant({
      birthDate: birthDateValue,
      eventDate: event.start_date,
      guardianName: text(answers.guardian_name),
      minAge: program.min_age,
      maxAge: program.max_age,
    });
    if (
      participantValidation.age == null ||
      participantValidation.errors.length
    )
      return NextResponse.json(
        { error: participantValidation.errors[0] },
        { status: 400 },
      );
    const age = participantValidation.age;
    const birthYear = Number(birthDateValue.slice(0, 4));
    if (
      (program.min_birth_year != null && birthYear < program.min_birth_year) ||
      (program.max_birth_year != null && birthYear > program.max_birth_year)
    )
      return NextResponse.json(
        { error: "El año de nacimiento no corresponde a la modalidad" },
        { status: 400 },
      );

    for (const periodId of input.period_ids) {
      const { data: relation } = await admin
        .from("event_program_periods")
        .select("capacity,is_available")
        .eq("program_id", program.id)
        .eq("period_id", periodId)
        .maybeSingle();
      if (!relation?.is_available)
        return NextResponse.json(
          { error: "Una semana seleccionada ya no está disponible" },
          { status: 409 },
        );
    }
    const calculation = await calculateRegistrationPrice(
      {
        eventId: event.id,
        programId: program.id,
        periodIds: input.period_ids,
        participantType: input.participant_type,
        discountCode: input.discount_code ?? undefined,
      },
      admin,
    );
    const participantName = [
      text(answers.participant_name),
      text(answers.first_surname),
      text(answers.second_surname),
    ]
      .filter(Boolean)
      .join(" ");
    const email = text(answers.participant_email);
    const { data: duplicate } = await admin
      .from("registrations")
      .select("id")
      .eq("event_id", event.id)
      .ilike("participant_email", email)
      .ilike("participant_name", participantName)
      .neq("payment_status", "cancelled")
      .maybeSingle();
    if (duplicate)
      return NextResponse.json(
        { error: "Este participante ya está inscrito" },
        { status: 409 },
      );
    const requiresPayment =
      program.payment_timing === "immediate" && calculation.finalAmount > 0;
    const { data: registration, error: registrationError } = await admin
      .from("registrations")
      .insert({
        event_id: event.id,
        form_id: form.id,
        program_id: program.id,
        participant_type: input.participant_type,
        participant_name: participantName,
        participant_email: email,
        participant_phone: text(answers.participant_phone) || null,
        participant_age: age,
        participant_birth_date: birthDateValue,
        guardian_name: text(answers.guardian_name) || null,
        current_club: text(answers.current_club) || null,
        shirt_size: text(answers.shirt_size) || null,
        allergies: null,
        medical_notes: null,
        image_consent: answers.image_consent === true,
        notes: text(answers.notes) || null,
        total_amount: calculation.finalAmount / 100,
        currency: calculation.currency,
        source: "web",
        submitted_at: new Date().toISOString(),
        registration_status:
          requiresPayment && input.payment_method === "card"
            ? "pending_payment"
            : program.payment_timing === "immediate"
              ? "confirmed"
              : "requested",
        payment_status: calculation.finalAmount === 0 ? "paid" : "pending",
      })
      .select("id")
      .single();
    if (registrationError) throw registrationError;
    createdId = registration.id;
    const partitionedAnswers = partitionRegistrationAnswers(
      registration.id,
      answers,
      fields ?? [],
    );
    const perPeriod =
      Math.round(calculation.finalAmount / input.period_ids.length) / 100;
    const consentRows = (fields ?? []).flatMap((field) => {
      const rules = field.validation_rules as {
        consent?: boolean;
        version?: string;
      };
      if (!rules.consent) return [];
      return [
        {
          registration_id: registration.id,
          consent_key: field.field_key,
          consent_version: rules.version ?? "provisional-v1",
          consent_text: field.label,
          accepted: answers[field.field_key] === true,
          accepted_at:
            answers[field.field_key] === true ? new Date().toISOString() : null,
          ip_address:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            null,
          user_agent: request.headers.get("user-agent"),
          guardian_identity: text(answers.guardian_name) || null,
        },
      ];
    });
    const writes = await Promise.all([
      partitionedAnswers.general.length
        ? admin.from("registration_answers").insert(partitionedAnswers.general)
        : Promise.resolve({ error: null }),
      partitionedAnswers.sensitive.length
        ? admin
            .from("registration_sensitive_answers")
            .insert(partitionedAnswers.sensitive)
        : Promise.resolve({ error: null }),
      admin.from("registration_sensitive_data").insert({
        registration_id: registration.id,
        allergies: text(answers.allergies) || null,
        medical_notes: text(answers.medical_notes) || null,
      }),
      admin.from("registration_periods").insert(
        input.period_ids.map((period_id) => ({
          registration_id: registration.id,
          period_id,
          program_id: program.id,
          price: perPeriod,
        })),
      ),
      consentRows.length
        ? admin.from("registration_consents").insert(consentRows)
        : Promise.resolve({ error: null }),
      admin.from("registration_price_snapshots").insert({
        registration_id: registration.id,
        calculation,
        base_amount: calculation.baseAmount,
        discount_amount: calculation.discounts.reduce(
          (sum, discount) => sum + discount.amount,
          0,
        ),
        final_amount: calculation.finalAmount,
        currency: calculation.currency,
      }),
      calculation.discounts.length
        ? admin.from("registration_discount_uses").insert(
            calculation.discounts.map((discount) => ({
              registration_id: registration.id,
              discount_id: discount.id,
              amount: discount.amount,
            })),
          )
        : Promise.resolve({ error: null }),
    ]);
    const writeError = writes.find((result) => result.error)?.error;
    if (writeError) throw writeError;
    const method =
      calculation.finalAmount === 0
        ? "free"
        : program.payment_timing !== "immediate"
          ? "reserve"
          : input.payment_method === "cash"
            ? "cash"
            : "stripe";
    const { error: paymentError } = await admin.from("payments").insert({
      registration_id: registration.id,
      event_id: event.id,
      amount: calculation.finalAmount / 100,
      status: calculation.finalAmount === 0 ? "paid" : "pending",
      method,
    });
    if (paymentError) throw paymentError;
    await reserveCapacity(admin, {
      eventId: event.id,
      programId: program.id,
      periodIds: input.period_ids,
      registrationId: registration.id,
    });
    if (method !== "stripe") {
      await confirmCapacity(admin, registration.id);
      await sendRegistrationEmail(
        admin,
        registration.id,
        "registration_received",
      );
      return NextResponse.json({
        success_url: `${appUrl(request)}/events/${event.slug}/register/success?method=${method}`,
      });
    }
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      expires_at: Math.floor(Date.now() / 1000) + STRIPE_CHECKOUT_MINUTES * 60,
      customer_email: email,
      client_reference_id: registration.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: calculation.currency.toLowerCase(),
            unit_amount: calculation.finalAmount,
            product_data: {
              name: `Inscripción · ${event.title} · ${program.name}`,
            },
          },
        },
      ],
      metadata: { registration_id: registration.id, event_id: event.id },
      payment_intent_data: {
        metadata: { registration_id: registration.id, event_id: event.id },
      },
      success_url: `${appUrl(request)}/events/${event.slug}/register/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl(request)}/api/stripe/cancel?registration_id=${registration.id}&event=${encodeURIComponent(event.slug)}&token=${createStripeCancelToken(registration.id)}`,
    });
    if (!session.url) throw new Error("Stripe no devolvió una URL");
    createdStripeSessionId = session.id;
    const { error: stripeReferenceError } = await admin
      .from("payments")
      .update({ stripe_session_id: session.id })
      .eq("registration_id", registration.id);
    if (stripeReferenceError) throw stripeReferenceError;
    await attachStripeSession(admin, registration.id, session.id);
    return NextResponse.json({ checkout_url: session.url });
  } catch (error) {
    if (createdStripeSessionId) {
      try {
        await getStripe().checkout.sessions.expire(createdStripeSessionId);
      } catch {
        // La eliminación local invalida igualmente la inscripción.
      }
    }
    if (createdId)
      await admin.from("registrations").delete().eq("id", createdId);
    if (error instanceof CapacityError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof PricingError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(
      "Dynamic registration failed",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "No pudimos completar la inscripción" },
      { status: 500 },
    );
  }
}

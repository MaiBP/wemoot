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
    const [{ data: event }, { data: form }] = await Promise.all([
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
    ]);
    const programIds = input.selections.map(
      (selection) => selection.program_id,
    );
    const { data: programs, error: programsError } = await admin
      .from("event_programs")
      .select("*")
      .eq("event_id", input.event_id)
      .eq("active", true)
      .in("id", programIds);
    if (programsError) throw programsError;
    if (!event || !form || !programs || programs.length !== programIds.length)
      return NextResponse.json(
        {
          error: "El evento, formulario o una modalidad ya no está disponible",
        },
        { status: 409 },
      );
    if (event.allow_multiple_programs === false && input.selections.length > 1)
      return NextResponse.json(
        { error: "Este evento solo permite elegir una modalidad." },
        { status: 400 },
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
    let age: number | null = null;
    const birthYear = Number(birthDateValue.slice(0, 4));
    for (const program of programs) {
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
          {
            error: `${program.name}: ${participantValidation.errors[0]}`,
          },
          { status: 400 },
        );
      age = participantValidation.age;
      if (
        (program.min_birth_year != null &&
          birthYear < program.min_birth_year) ||
        (program.max_birth_year != null && birthYear > program.max_birth_year)
      )
        return NextResponse.json(
          {
            error: `El año de nacimiento no corresponde a ${program.name}`,
          },
          { status: 400 },
        );
    }
    if (age == null)
      return NextResponse.json(
        { error: "No se pudo validar la edad del participante" },
        { status: 400 },
      );

    for (const selection of input.selections) {
      const { data: relations, error: relationsError } = await admin
        .from("event_program_periods")
        .select("period_id,is_available")
        .eq("program_id", selection.program_id)
        .in("period_id", selection.period_ids);
      if (relationsError) throw relationsError;
      if (
        relations?.length !== selection.period_ids.length ||
        relations.some((relation) => !relation.is_available)
      )
        return NextResponse.json(
          { error: "Un periodo seleccionado ya no está disponible" },
          { status: 409 },
        );
    }
    const calculatedItems = await Promise.all(
      input.selections.map(async (selection) => ({
        selection,
        calculation: await calculateRegistrationPrice(
          {
            eventId: event.id,
            programId: selection.program_id,
            periodIds: selection.period_ids,
            participantType: input.participant_type,
            discountCode: input.discount_code ?? undefined,
          },
          admin,
        ),
      })),
    );
    const currencies = new Set(
      calculatedItems.map((item) => item.calculation.currency),
    );
    if (currencies.size !== 1)
      return NextResponse.json(
        { error: "Las modalidades deben utilizar la misma moneda" },
        { status: 400 },
      );
    const calculation = {
      baseAmount: calculatedItems.reduce(
        (sum, item) => sum + item.calculation.baseAmount,
        0,
      ),
      finalAmount: calculatedItems.reduce(
        (sum, item) => sum + item.calculation.finalAmount,
        0,
      ),
      discounts: calculatedItems.flatMap((item) => item.calculation.discounts),
      currency: calculatedItems[0].calculation.currency,
      items: calculatedItems.map((item) => ({
        programId: item.selection.program_id,
        periodIds: item.selection.period_ids,
        calculation: item.calculation,
      })),
    };
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
    const preregistration = event.registration_mode === "preregistration";
    const immediatePayment = programs.every(
      (program) => program.payment_timing === "immediate",
    );
    const requiresPayment =
      !preregistration && immediatePayment && calculation.finalAmount > 0;
    const { data: registration, error: registrationError } = await admin
      .from("registrations")
      .insert({
        event_id: event.id,
        form_id: form.id,
        program_id: input.selections[0].program_id,
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
        registration_status: preregistration
          ? "preregistered"
          : requiresPayment && input.payment_method === "card"
            ? "pending_payment"
            : immediatePayment
              ? "confirmed"
              : "requested",
        payment_status:
          !preregistration && calculation.finalAmount === 0
            ? "paid"
            : "pending",
      })
      .select("id,public_token,queue_position")
      .single();
    if (registrationError) throw registrationError;
    createdId = registration.id;
    const partitionedAnswers = partitionRegistrationAnswers(
      registration.id,
      answers,
      fields ?? [],
    );
    const registrationPeriods = calculatedItems.flatMap((item) => {
      const perPeriod =
        Math.round(
          item.calculation.finalAmount / item.selection.period_ids.length,
        ) / 100;
      return item.selection.period_ids.map((period_id) => ({
        registration_id: registration.id,
        period_id,
        program_id: item.selection.program_id,
        price: perPeriod,
      }));
    });
    const registrationPrograms = calculatedItems.map((item) => ({
      registration_id: registration.id,
      event_id: event.id,
      program_id: item.selection.program_id,
      amount: item.calculation.finalAmount / 100,
      currency: item.calculation.currency,
    }));
    const discountUses = Array.from(
      calculation.discounts
        .reduce(
          (
            uses: Map<string, { discount_id: string; amount: number }>,
            discount,
          ) => {
            const current = uses.get(discount.id);
            uses.set(discount.id, {
              discount_id: discount.id,
              amount: (current?.amount ?? 0) + discount.amount,
            });
            return uses;
          },
          new Map(),
        )
        .values(),
    );
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
      admin.from("registration_periods").insert(registrationPeriods),
      admin.from("registration_programs").insert(registrationPrograms),
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
      discountUses.length
        ? admin.from("registration_discount_uses").insert(
            discountUses.map((discount) => ({
              registration_id: registration.id,
              discount_id: discount.discount_id,
              amount: discount.amount,
            })),
          )
        : Promise.resolve({ error: null }),
    ]);
    const writeError = writes.find((result) => result.error)?.error;
    if (writeError) throw writeError;
    const method = preregistration
      ? "deferred"
      : calculation.finalAmount === 0
        ? "free"
        : !immediatePayment
          ? "reserve"
          : input.payment_method === "cash"
            ? "cash"
            : "stripe";
    const { error: paymentError } = await admin.from("payments").insert({
      registration_id: registration.id,
      event_id: event.id,
      amount: calculation.finalAmount / 100,
      status:
        !preregistration && calculation.finalAmount === 0 ? "paid" : "pending",
      method,
    });
    if (paymentError) throw paymentError;
    if (preregistration) {
      await sendRegistrationEmail(
        admin,
        registration.id,
        "preregistration_received",
      );
      return NextResponse.json({
        success_url: `${appUrl(request)}/events/${event.slug}/register/success?method=preregistration&token=${registration.public_token}`,
        queue_position: registration.queue_position,
      });
    }
    for (const selection of input.selections)
      await reserveCapacity(admin, {
        eventId: event.id,
        programId: selection.program_id,
        periodIds: selection.period_ids,
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
              name: `Inscripción · ${event.title} · ${programs
                .map((program) => program.name)
                .join(" + ")}`.slice(0, 127),
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
    if (
      error instanceof Error &&
      error.message.includes("PREREGISTRATION_FULL")
    )
      return NextResponse.json(
        { error: "Se alcanzó el límite de preinscripciones." },
        { status: 409 },
      );
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

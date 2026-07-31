import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSlug } from "@/lib/slug";
import { eventCreationSchema } from "@/lib/validations";
import { generateMarketingCopy } from "@/lib/event-parser";
import {
  generatePeriods,
  periodUnitLabel,
} from "@/lib/events/generate-periods";
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });
  return NextResponse.json(
    error ? { error: error.message } : { events: data },
    { status: error ? 400 : 200 },
  );
}
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const admin = createAdminClient();
  const parsed = eventCreationSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  const {
    programs,
    periods,
    event_mode: eventMode,
    period_unit: periodUnit,
    initial_prices: initialPrices,
    program_setups: programSetups,
    ...eventValues
  } = parsed.data;
  const isAdvanced = eventMode === "advanced";
  const generatedProgramPeriods = programSetups.map((setup) =>
    generatePeriods(
      setup.period_unit,
      setup.start_date,
      setup.end_date,
      setup.weekly_days,
    ),
  );
  if (
    generatedProgramPeriods.some(
      (generated) => !generated.length || generated.length > 52,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Cada modalidad debe generar entre 1 y 52 periodos. Revisa sus fechas.",
      },
      { status: 400 },
    );
  }
  const capacity = isAdvanced
    ? programs.reduce((total, program) => total + program.capacity, 0)
    : (eventValues.capacity ?? 1);
  const price = isAdvanced ? 0 : (eventValues.price ?? 0);
  const copy = await generateMarketingCopy({
    ...eventValues,
    price,
    capacity,
  }).catch(() => ({
    social_copy: `⚽ ${parsed.data.title}\n📍 ${parsed.data.city}\n📅 ${parsed.data.start_date}\n¡Reserva tu plaza!`,
    whatsapp_message: `Hola, abrimos inscripciones para ${parsed.data.title} en ${parsed.data.city}.`,
  }));
  const { data: organization } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const { data: selectedLocation } = eventValues.location_id
    ? await supabase
        .from("organization_locations")
        .select("id,name,address_line_1,city")
        .eq("id", eventValues.location_id)
        .maybeSingle()
    : { data: null };
  if (eventValues.location_id && !selectedLocation)
    return NextResponse.json(
      { error: "Ubicación no disponible" },
      { status: 400 },
    );
  const { data, error } = await admin
    .from("events")
    .insert({
      ...eventValues,
      price,
      capacity,
      event_mode: eventMode,
      complexity: isAdvanced ? "complex" : "simple",
      general_settings: isAdvanced
        ? programSetups.length
          ? {
              mixed_period_units: true,
              period_units: programSetups.map((setup) => setup.period_unit),
            }
          : { period_unit: periodUnit }
        : {},
      description: eventValues.description || null,
      location:
        selectedLocation?.name ||
        selectedLocation?.address_line_1 ||
        eventValues.location ||
        null,
      city: selectedLocation?.city || eventValues.city,
      schedule: eventValues.schedule || null,
      age_range: eventValues.age_range || null,
      owner_id: user.id,
      organization_id: organization?.id ?? null,
      slug: createSlug(eventValues.title),
      status: "draft",
      payment_mode: "manual",
      created_from: "web",
      ...copy,
    })
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "No se pudo crear el evento" },
      { status: 400 },
    );
  }
  if (isAdvanced) {
    const { data: savedPrograms, error: programsError } = await admin
      .from("event_programs")
      .insert(
        programs.map((program, index) => ({
          ...program,
          event_id: data.id,
          slug: `${createSlug(program.name)}-${index + 1}`,
          shift: program.turn,
          active: true,
          is_active: true,
          position: index,
          sort_order: index,
          metadata: (() => {
            const setup = programSetups.find(
              (item) => item.program_index === index,
            );
            return setup
              ? {
                  period_unit: setup.period_unit,
                  weekly_days: setup.weekly_days,
                  sessions_per_period: setup.sessions_per_period,
                }
              : {};
          })(),
        })),
      )
      .select("id,capacity,position");
    if (programsError || !savedPrograms?.length) {
      await admin.from("events").delete().eq("id", data.id);
      return NextResponse.json(
        {
          error:
            programsError?.message ??
            "No se pudieron crear las modalidades iniciales",
        },
        { status: 400 },
      );
    }
    const periodDrafts = programSetups.length
      ? programSetups.flatMap((setup, setupIndex) =>
          generatedProgramPeriods[setupIndex].map((period) => {
            const override = setup.overrides.find(
              (item) => item.period_start_date === period.start_date,
            );
            const sessionLabel = `${setup.sessions_per_period} ${
              setup.sessions_per_period === 1 ? "sesión" : "sesiones"
            }`;
            return {
              ...period,
              label: `${period.label} · ${sessionLabel}`,
              program_index: setup.program_index,
              member_amount: override?.member_amount ?? setup.member_amount,
              non_member_amount:
                override?.non_member_amount ?? setup.non_member_amount,
              has_override: override != null,
              sessions_per_period: setup.sessions_per_period,
            };
          }),
        )
      : periods.map((period) => ({
          ...period,
          program_index: null,
          member_amount: null,
          non_member_amount: null,
          has_override: false,
          sessions_per_period: null,
        }));
    const { data: savedPeriods, error: periodsError } = await admin
      .from("event_periods")
      .insert(
        periodDrafts.map((period, index) => ({
          label: period.label,
          start_date: period.start_date,
          end_date: period.end_date,
          event_id: data.id,
          name: period.label,
          active: true,
          is_active: true,
          position: index,
          sort_order: index,
        })),
      )
      .select("id,position");
    if (periodsError || !savedPeriods?.length) {
      await admin.from("events").delete().eq("id", data.id);
      return NextResponse.json(
        {
          error:
            periodsError?.message ??
            "No se pudieron crear los periodos iniciales",
        },
        { status: 400 },
      );
    }
    const availability = programSetups.length
      ? periodDrafts.flatMap((period, index) => {
          const program = savedPrograms.find(
            (item) => item.position === period.program_index,
          );
          const savedPeriod = savedPeriods.find(
            (item) => item.position === index,
          );
          return program && savedPeriod
            ? [
                {
                  program_id: program.id,
                  period_id: savedPeriod.id,
                  capacity: program.capacity,
                  is_available: true,
                },
              ]
            : [];
        })
      : savedPrograms.flatMap((program) =>
          savedPeriods.map((period) => ({
            program_id: program.id,
            period_id: period.id,
            capacity: program.capacity,
            is_available: true,
          })),
        );
    const { error: availabilityError } = await admin
      .from("event_program_periods")
      .insert(availability);
    if (availabilityError) {
      await admin.from("events").delete().eq("id", data.id);
      return NextResponse.json(
        { error: availabilityError.message },
        { status: 400 },
      );
    }
    const priceRules = programSetups.length
      ? [
          ...periodDrafts.flatMap((period, index) => {
            const program = savedPrograms.find(
              (item) => item.position === period.program_index,
            );
            const savedPeriod = savedPeriods.find(
              (item) => item.position === index,
            );
            const programName =
              programs[period.program_index ?? -1]?.name ?? "Modalidad";
            if (!program || !savedPeriod) return [];
            const description = period.has_override
              ? `Precio especial para este periodo · ${period.sessions_per_period} ${
                  period.sessions_per_period === 1 ? "sesión" : "sesiones"
                }.`
              : `Precio base del periodo · ${period.sessions_per_period} ${
                  period.sessions_per_period === 1 ? "sesión" : "sesiones"
                }.`;
            return [
              {
                event_id: data.id,
                program_id: program.id,
                period_id: savedPeriod.id,
                participant_type: "member",
                pricing_type: "per_period",
                quantity_from: null,
                quantity_to: null,
                amount: period.member_amount,
                currency: "EUR",
                label: `${period.label} · ${programName} · Precio Club`,
                description,
                priority: period.has_override ? 650 : 500,
                is_active: true,
              },
              {
                event_id: data.id,
                program_id: program.id,
                period_id: savedPeriod.id,
                participant_type: "non_member",
                pricing_type: "per_period",
                quantity_from: null,
                quantity_to: null,
                amount: period.non_member_amount,
                currency: "EUR",
                label: `${period.label} · ${programName} · Precio No Club`,
                description,
                priority: period.has_override ? 650 : 500,
                is_active: true,
              },
            ];
          }),
          ...programSetups.flatMap((setup) => {
            if (
              setup.full_member_amount == null ||
              setup.full_non_member_amount == null
            )
              return [];
            const program = savedPrograms.find(
              (item) => item.position === setup.program_index,
            );
            const programName =
              programs[setup.program_index]?.name ?? "Modalidad";
            if (!program) return [];
            return [
              {
                event_id: data.id,
                program_id: program.id,
                period_id: null,
                participant_type: "member",
                pricing_type: "full_event",
                quantity_from: null,
                quantity_to: null,
                amount: setup.full_member_amount,
                currency: "EUR",
                label: `${programName} · Evento completo Club`,
                description: "Precio cerrado para todos los periodos.",
                priority: 700,
                is_active: true,
              },
              {
                event_id: data.id,
                program_id: program.id,
                period_id: null,
                participant_type: "non_member",
                pricing_type: "full_event",
                quantity_from: null,
                quantity_to: null,
                amount: setup.full_non_member_amount,
                currency: "EUR",
                label: `${programName} · Evento completo No Club`,
                description: "Precio cerrado para todos los periodos.",
                priority: 700,
                is_active: true,
              },
            ];
          }),
        ]
      : savedPrograms.flatMap((program) => {
          const configured = initialPrices.find(
            (price) => price.program_index === program.position,
          );
          if (!configured) return [];
          const unitLabel = periodUnitLabel(periodUnit);
          const base = [
            {
              event_id: data.id,
              program_id: program.id,
              period_id: null,
              participant_type: "member",
              pricing_type: "per_period",
              quantity_from: null,
              quantity_to: null,
              amount: configured.member_amount,
              currency: "EUR",
              label: `${unitLabel} Club`,
              description: `Precio por ${unitLabel.toLocaleLowerCase("es")}.`,
              priority: 500,
              is_active: true,
            },
            {
              event_id: data.id,
              program_id: program.id,
              period_id: null,
              participant_type: "non_member",
              pricing_type: "per_period",
              quantity_from: null,
              quantity_to: null,
              amount: configured.non_member_amount,
              currency: "EUR",
              label: `${unitLabel} No Club`,
              description: `Precio por ${unitLabel.toLocaleLowerCase("es")}.`,
              priority: 500,
              is_active: true,
            },
          ];
          if (
            configured.full_member_amount == null ||
            configured.full_non_member_amount == null
          )
            return base;
          return [
            ...base,
            {
              ...base[0],
              pricing_type: "full_event",
              amount: configured.full_member_amount,
              label: "Evento completo Club",
              description: "Precio cerrado para todos los periodos.",
              priority: 600,
            },
            {
              ...base[1],
              pricing_type: "full_event",
              amount: configured.full_non_member_amount,
              label: "Evento completo No Club",
              description: "Precio cerrado para todos los periodos.",
              priority: 600,
            },
          ];
        });
    const { error: pricesError } = await admin
      .from("event_price_rules")
      .insert(priceRules);
    if (pricesError) {
      await admin.from("events").delete().eq("id", data.id);
      return NextResponse.json({ error: pricesError.message }, { status: 400 });
    }
  }
  return NextResponse.json({ event: data }, { status: 201 });
}
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json();
  if (!body.id || !["draft", "published", "cancelled"].includes(body.status))
    return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  if (body.status === "published") {
    const { data: event } = await supabase
      .from("events")
      .select("event_mode,complexity")
      .eq("id", body.id)
      .maybeSingle();
    if (event?.event_mode === "advanced" || event?.complexity === "complex") {
      const { data: programs } = await supabase
        .from("event_programs")
        .select("id,name")
        .eq("event_id", body.id)
        .eq("active", true);
      const programIds = (programs ?? []).map((program) => program.id);
      const [
        { count: periods },
        { data: priceRules },
        { count: forms },
        availabilityResult,
      ] = await Promise.all([
        supabase
          .from("event_periods")
          .select("id", { count: "exact", head: true })
          .eq("event_id", body.id)
          .eq("active", true),
        supabase
          .from("event_price_rules")
          .select("program_id,participant_type")
          .eq("event_id", body.id)
          .eq("is_active", true),
        supabase
          .from("registration_forms")
          .select("id", { count: "exact", head: true })
          .eq("event_id", body.id)
          .eq("status", "published"),
        programIds.length
          ? supabase
              .from("event_program_periods")
              .select("id", { count: "exact", head: true })
              .in("program_id", programIds)
              .eq("is_available", true)
          : Promise.resolve({ count: 0 }),
      ]);
      const uncoveredPrograms = (programs ?? []).filter((program) => {
        const applicable = (priceRules ?? []).filter(
          (rule) => rule.program_id == null || rule.program_id === program.id,
        );
        return !(
          applicable.some((rule) => rule.participant_type === "general") ||
          (applicable.some((rule) => rule.participant_type === "member") &&
            applicable.some((rule) => rule.participant_type === "non_member"))
        );
      });
      if (
        !programIds.length ||
        !periods ||
        !priceRules?.length ||
        !forms ||
        !availabilityResult.count
      ) {
        return NextResponse.json(
          {
            error:
              "Configura modalidades, periodos, disponibilidad, precios y publica el formulario de inscripción antes de publicar el evento.",
          },
          { status: 400 },
        );
      }
      if (uncoveredPrograms.length) {
        return NextResponse.json(
          {
            error: `Faltan precios para: ${uncoveredPrograms
              .map((program) => program.name)
              .join(
                ", ",
              )}. Configura un precio general o precios de socio y no socio.`,
          },
          { status: 400 },
        );
      }
    }
  }
  const { data, error } = await supabase
    .from("events")
    .update({ status: body.status })
    .eq("id", body.id)
    .select()
    .single();
  return NextResponse.json(error ? { error: error.message } : { event: data }, {
    status: error ? 400 : 200,
  });
}

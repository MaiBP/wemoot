import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  eventDiscountSchema,
  eventPeriodSchema,
  eventPriceSchema,
  eventProgramPeriodSchema,
  eventProgramSchema,
  eventPriceRuleSchema,
} from "@/lib/validations";
import { createSlug } from "@/lib/slug";

async function getOwnedEvent(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, event: null, unauthorized: true };
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  return { supabase, event, unauthorized: false };
}

async function refreshEventTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
) {
  const [{ data: programs }, { data: rules }, { data: legacyPrices }] =
    await Promise.all([
      supabase
        .from("event_programs")
        .select("capacity")
        .eq("event_id", eventId),
      supabase
        .from("event_price_rules")
        .select("amount")
        .eq("event_id", eventId)
        .eq("is_active", true),
      supabase
        .from("event_prices")
        .select("amount")
        .eq("event_id", eventId)
        .eq("active", true),
    ]);
  const capacity = (programs ?? []).reduce(
    (total, program) => total + Number(program.capacity),
    0,
  );
  const amounts = (rules?.length ? rules : (legacyPrices ?? [])).map((price) =>
    Number(price.amount),
  );
  await supabase
    .from("events")
    .update({
      event_mode: "advanced",
      ...(capacity > 0 ? { capacity } : {}),
      ...(amounts.length ? { price: Math.min(...amounts) } : {}),
    })
    .eq("id", eventId);
}

async function ensureProgramPeriods(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
) {
  const [{ data: programs }, { data: periods }] = await Promise.all([
    supabase
      .from("event_programs")
      .select("id,capacity")
      .eq("event_id", eventId),
    supabase.from("event_periods").select("id").eq("event_id", eventId),
  ]);
  if (!programs?.length || !periods?.length) return;
  const { data: existing } = await supabase
    .from("event_program_periods")
    .select("program_id,period_id")
    .in(
      "program_id",
      programs.map((program) => program.id),
    );
  const known = new Set(
    (existing ?? []).map(
      (relation) => `${relation.program_id}:${relation.period_id}`,
    ),
  );
  const missing = programs.flatMap((program) =>
    periods.flatMap((period) =>
      known.has(`${program.id}:${period.id}`)
        ? []
        : [
            {
              program_id: program.id,
              period_id: period.id,
              capacity: program.capacity,
            },
          ],
    ),
  );
  if (missing.length) {
    const { error } = await supabase
      .from("event_program_periods")
      .insert(missing);
    if (error) throw error;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  const { supabase, event, unauthorized } = await getOwnedEvent(eventId);
  if (unauthorized) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!event) {
    return NextResponse.json(
      { error: "Evento no encontrado" },
      { status: 404 },
    );
  }

  const body = (await request.json()) as { kind?: string; data?: unknown };
  let result;
  if (body.kind === "program") {
    const parsed = eventProgramSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos no válidos" },
        { status: 400 },
      );
    const { id: recordId, ...values } = parsed.data;
    const payload = {
      ...values,
      event_id: eventId,
      ...(!recordId ? { slug: createSlug(values.name) } : {}),
      shift: values.turn,
      is_active: true,
      metadata: {},
    };
    result = await (
      recordId
        ? supabase
            .from("event_programs")
            .update(payload)
            .eq("id", recordId)
            .eq("event_id", eventId)
        : supabase.from("event_programs").insert(payload)
    )
      .select()
      .single();
  } else if (body.kind === "period") {
    const parsed = eventPeriodSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos no válidos" },
        { status: 400 },
      );
    const { id: recordId, ...values } = parsed.data;
    const payload = {
      ...values,
      event_id: eventId,
      name: values.label,
      is_active: true,
    };
    result = await (
      recordId
        ? supabase
            .from("event_periods")
            .update(payload)
            .eq("id", recordId)
            .eq("event_id", eventId)
        : supabase.from("event_periods").insert(payload)
    )
      .select()
      .single();
  } else if (body.kind === "price") {
    const parsed = eventPriceSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos no válidos" },
        { status: 400 },
      );
    const { id: recordId, ...values } = parsed.data;
    const payload = { ...values, event_id: eventId };
    result = await (
      recordId
        ? supabase
            .from("event_prices")
            .update(payload)
            .eq("id", recordId)
            .eq("event_id", eventId)
        : supabase.from("event_prices").insert(payload)
    )
      .select()
      .single();
  } else if (body.kind === "availability") {
    const parsed = eventProgramPeriodSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos no válidos" },
        { status: 400 },
      );
    const { data: program } = await supabase
      .from("event_programs")
      .select("id")
      .eq("id", parsed.data.program_id)
      .eq("event_id", eventId)
      .maybeSingle();
    const { data: period } = await supabase
      .from("event_periods")
      .select("id")
      .eq("id", parsed.data.period_id)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!program || !period) {
      return NextResponse.json(
        { error: "La modalidad o el periodo no pertenecen al evento" },
        { status: 400 },
      );
    }
    result = await supabase
      .from("event_program_periods")
      .update({
        capacity: parsed.data.capacity,
        is_available: parsed.data.is_available,
      })
      .eq("id", parsed.data.id)
      .eq("program_id", parsed.data.program_id)
      .eq("period_id", parsed.data.period_id)
      .select()
      .single();
  } else if (body.kind === "price_rule") {
    const parsed = eventPriceRuleSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos no válidos" },
        { status: 400 },
      );
    const { id: recordId, ...values } = parsed.data;
    if (values.program_id) {
      const { data: program } = await supabase
        .from("event_programs")
        .select("id")
        .eq("id", values.program_id)
        .eq("event_id", eventId)
        .maybeSingle();
      if (!program)
        return NextResponse.json(
          { error: "La modalidad no pertenece al evento" },
          { status: 400 },
        );
    }
    if (values.period_id) {
      const { data: period } = await supabase
        .from("event_periods")
        .select("id")
        .eq("id", values.period_id)
        .eq("event_id", eventId)
        .maybeSingle();
      if (!period)
        return NextResponse.json(
          { error: "El periodo no pertenece al evento" },
          { status: 400 },
        );
    }
    const payload = {
      ...values,
      event_id: eventId,
      currency: values.currency.toUpperCase(),
      starts_at: values.starts_at
        ? new Date(values.starts_at).toISOString()
        : null,
      ends_at: values.ends_at ? new Date(values.ends_at).toISOString() : null,
    };
    result = await (
      recordId
        ? supabase
            .from("event_price_rules")
            .update(payload)
            .eq("id", recordId)
            .eq("event_id", eventId)
        : supabase.from("event_price_rules").insert(payload)
    )
      .select()
      .single();
  } else if (body.kind === "discount") {
    const parsed = eventDiscountSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos no válidos" },
        { status: 400 },
      );
    const { id: recordId, ...values } = parsed.data;
    if (values.program_id) {
      const { data: program } = await supabase
        .from("event_programs")
        .select("id")
        .eq("id", values.program_id)
        .eq("event_id", eventId)
        .maybeSingle();
      if (!program)
        return NextResponse.json(
          { error: "La modalidad no pertenece al evento" },
          { status: 400 },
        );
    }
    const payload = {
      ...values,
      event_id: eventId,
      code: values.code?.toUpperCase() ?? null,
      starts_at: values.starts_at
        ? new Date(values.starts_at).toISOString()
        : null,
      ends_at: values.ends_at ? new Date(values.ends_at).toISOString() : null,
    };
    result = await (
      recordId
        ? supabase
            .from("event_discounts")
            .update(payload)
            .eq("id", recordId)
            .eq("event_id", eventId)
        : supabase.from("event_discounts").insert(payload)
    )
      .select()
      .single();
  } else {
    return NextResponse.json(
      { error: "Tipo de estructura no válido" },
      { status: 400 },
    );
  }
  const { data, error } = result;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (body.kind === "program" || body.kind === "period") {
    await ensureProgramPeriods(supabase, eventId);
  }
  await refreshEventTotals(supabase, eventId);
  return NextResponse.json({ item: data }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  const { supabase, event, unauthorized } = await getOwnedEvent(eventId);
  if (unauthorized) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!event) {
    return NextResponse.json(
      { error: "Evento no encontrado" },
      { status: 404 },
    );
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const recordId = url.searchParams.get("record_id");
  const tables = {
    program: "event_programs",
    period: "event_periods",
    price: "event_prices",
    price_rule: "event_price_rules",
    discount: "event_discounts",
  } as const;
  const table = tables[kind as keyof typeof tables];
  if (!table || !recordId) {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
  }
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", recordId)
    .eq("event_id", eventId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await refreshEventTotals(supabase, eventId);
  return NextResponse.json({ ok: true });
}

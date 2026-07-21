import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSlug } from "@/lib/slug";
import { eventSchema } from "@/lib/validations";
import { generateMarketingCopy } from "@/lib/event-parser";
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
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  const copy = await generateMarketingCopy(parsed.data).catch(() => ({
    social_copy: `⚽ ${parsed.data.title}\n📍 ${parsed.data.city}\n📅 ${parsed.data.start_date}\n¡Reserva tu plaza!`,
    whatsapp_message: `Hola, abrimos inscripciones para ${parsed.data.title} en ${parsed.data.city}.`,
  }));
  const { data, error } = await supabase
    .from("events")
    .insert({
      ...parsed.data,
      description: parsed.data.description || null,
      location: parsed.data.location || null,
      schedule: parsed.data.schedule || null,
      age_range: parsed.data.age_range || null,
      owner_id: user.id,
      organization_id: null,
      slug: createSlug(parsed.data.title),
      status: "draft",
      payment_mode: "manual",
      created_from: "web",
      ...copy,
    })
    .select()
    .single();
  return NextResponse.json(error ? { error: error.message } : { event: data }, {
    status: error ? 400 : 201,
  });
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
        .select("id")
        .eq("event_id", body.id)
        .eq("active", true);
      const programIds = (programs ?? []).map((program) => program.id);
      const [
        { count: periods },
        { count: prices },
        { count: priceRules },
        availabilityResult,
      ] = await Promise.all([
        supabase
          .from("event_periods")
          .select("id", { count: "exact", head: true })
          .eq("event_id", body.id)
          .eq("active", true),
        supabase
          .from("event_prices")
          .select("id", { count: "exact", head: true })
          .eq("event_id", body.id)
          .eq("active", true),
        supabase
          .from("event_price_rules")
          .select("id", { count: "exact", head: true })
          .eq("event_id", body.id)
          .eq("is_active", true),
        programIds.length
          ? supabase
              .from("event_program_periods")
              .select("id", { count: "exact", head: true })
              .in("program_id", programIds)
              .eq("is_available", true)
          : Promise.resolve({ count: 0 }),
      ]);
      if (
        !programIds.length ||
        !periods ||
        !prices ||
        !priceRules ||
        !availabilityResult.count
      ) {
        return NextResponse.json(
          {
            error:
              "Añade al menos una modalidad, un periodo, una combinación disponible, una tarifa y una regla de precio antes de publicar.",
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

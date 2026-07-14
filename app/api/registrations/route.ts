import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registrationSchema } from "@/lib/validations";
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = registrationSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", parsed.data.event_id)
    .single();
  if (!event)
    return NextResponse.json(
      { error: "Evento no encontrado" },
      { status: 404 },
    );
  const { data, error } = await supabase
    .from("registrations")
    .insert({
      ...parsed.data,
      participant_email: parsed.data.participant_email || null,
      participant_phone: parsed.data.participant_phone || null,
      participant_age: parsed.data.participant_age || null,
      notes: parsed.data.notes || null,
      payment_status: "pending",
    })
    .select()
    .single();
  return NextResponse.json(
    error ? { error: error.message } : { registration: data },
    { status: error ? 400 : 201 },
  );
}

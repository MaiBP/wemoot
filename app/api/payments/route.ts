import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { paymentUpdateSchema } from "@/lib/validations";
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = paymentUpdateSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
  const { data, error } = await supabase
    .from("registrations")
    .update({ payment_status: parsed.data.status })
    .eq("id", parsed.data.registration_id)
    .select()
    .single();
  if (!error && data) {
    const { data: event } = await supabase
      .from("events")
      .select("price")
      .eq("id", data.event_id)
      .single();
    await supabase
      .from("payments")
      .upsert(
        {
          registration_id: data.id,
          event_id: data.event_id,
          amount: Number(event?.price ?? 0),
          status: parsed.data.status,
          method: "manual",
        },
        { onConflict: "registration_id" },
      );
  }
  return NextResponse.json(
    error ? { error: error.message } : { registration: data },
    { status: error ? 400 : 200 },
  );
}

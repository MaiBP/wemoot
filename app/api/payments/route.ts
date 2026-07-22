import { NextResponse } from "next/server";
import {
  cancelCapacity,
  CapacityError,
  confirmCapacity,
} from "@/lib/capacity/reservations";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const { data: current, error: currentError } = await supabase
    .from("registrations")
    .select(
      "id,event_id,program_id,total_amount,payment_status,registration_status",
    )
    .eq("id", parsed.data.registration_id)
    .single();
  if (currentError || !current)
    return NextResponse.json(
      { error: currentError?.message ?? "Inscripción no encontrada" },
      { status: 404 },
    );

  try {
    if (current.program_id) {
      const admin = createAdminClient();
      if (parsed.data.status === "paid")
        await confirmCapacity(admin, current.id);
      else if (parsed.data.status === "cancelled")
        await cancelCapacity(admin, current.id);
    }
  } catch (error) {
    if (error instanceof CapacityError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }

  const { data, error } = await supabase
    .from("registrations")
    .update({
      payment_status: parsed.data.status,
      registration_status:
        parsed.data.status === "paid"
          ? "confirmed"
          : parsed.data.status === "cancelled"
            ? "cancelled"
            : current.registration_status,
    })
    .eq("id", current.id)
    .select()
    .single();
  if (!error && data) {
    await supabase.from("payments").upsert(
      {
        registration_id: data.id,
        event_id: data.event_id,
        amount: Number(data.total_amount ?? 0),
        status: parsed.data.status,
        method: "manual",
        paid_at:
          parsed.data.status === "paid" ? new Date().toISOString() : null,
      },
      { onConflict: "registration_id" },
    );
  }
  return NextResponse.json(
    error ? { error: error.message } : { registration: data },
    { status: error ? 400 : 200 },
  );
}

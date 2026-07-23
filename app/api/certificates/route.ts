import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveEventPermissions } from "@/lib/auth/permissions";
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { event_id } = await request.json();
  const { data: role } = await supabase.rpc("get_event_role", {
    target_event_id: event_id,
  });
  if (!resolveEventPermissions(role).canManageRegistrations)
    return NextResponse.json({ error: "No tienes permiso para preparar certificados" }, { status: 403 });
  const { data: registrations } = await supabase
    .from("registrations")
    .select("id")
    .eq("event_id", event_id);
  if (!registrations?.length) return NextResponse.json({ prepared: 0 });
  const rows = registrations.map((r) => ({
    event_id,
    registration_id: r.id,
    status: "pending",
  }));
  const { error } = await supabase
    .from("certificates")
    .upsert(rows, {
      onConflict: "event_id,registration_id",
      ignoreDuplicates: true,
    });
  return NextResponse.json(
    error ? { error: error.message } : { prepared: rows.length },
    { status: error ? 400 : 200 },
  );
}

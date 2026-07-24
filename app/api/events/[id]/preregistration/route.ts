import { NextResponse } from "next/server";
import { resolveEventPermissions } from "@/lib/auth/permissions";
import {
  openEventPayments,
  processPreregistrationQueues,
} from "@/lib/preregistration/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { preregistrationSettingsSchema } from "@/lib/validations";

async function authorizedEvent(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado", status: 401 } as const;
  const [{ data: event }, { data: role }] = await Promise.all([
    supabase
      .from("events")
      .select("id,event_mode,complexity,registration_mode")
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("get_event_role", { target_event_id: id }),
  ]);
  if (!event) return { error: "Evento no encontrado", status: 404 } as const;
  if (!resolveEventPermissions(role).canManageRegistrations)
    return { error: "No tienes permiso", status: 403 } as const;
  if (event.event_mode !== "advanced" && event.complexity !== "complex")
    return {
      error: "La preinscripción multimodal requiere un evento avanzado",
      status: 409,
    } as const;
  return { supabase, event } as const;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorizedEvent(id);
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = preregistrationSettingsSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Configuración no válida" },
      { status: 400 },
    );
  const { count: activePreregistrations } = await auth.supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", id)
    .in("registration_status", [
      "preregistered",
      "waitlisted",
      "payment_invited",
      "pending_payment",
      "confirmed",
    ])
    .not("queue_position", "is", null);
  if (
    parsed.data.registration_mode === "direct" &&
    (activePreregistrations ?? 0) > 0
  )
    return NextResponse.json(
      {
        error:
          "No puedes desactivar la preinscripción mientras existan solicitudes activas.",
      },
      { status: 409 },
    );
  if (
    parsed.data.registration_mode === "preregistration" &&
    parsed.data.preregistration_limit < (activePreregistrations ?? 0)
  )
    return NextResponse.json(
      {
        error: `El límite no puede ser inferior a las ${activePreregistrations} solicitudes activas.`,
      },
      { status: 409 },
    );
  const { data, error } = await auth.supabase
    .from("events")
    .update({
      ...parsed.data,
      payment_opened_at:
        parsed.data.registration_mode === "direct" ? null : undefined,
    })
    .eq("id", id)
    .select()
    .single();
  return NextResponse.json(error ? { error: error.message } : { event: data }, {
    status: error ? 400 : 200,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorizedEvent(id);
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json()) as { action?: string };
  if (!["open", "process"].includes(body.action ?? ""))
    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  if (auth.event.registration_mode !== "preregistration")
    return NextResponse.json(
      { error: "Activa primero la preinscripción para este evento." },
      { status: 409 },
    );
  const admin = createAdminClient();
  const result =
    body.action === "open"
      ? await openEventPayments(admin, id)
      : await processPreregistrationQueues(admin, id);
  return NextResponse.json({ ok: true, ...result });
}

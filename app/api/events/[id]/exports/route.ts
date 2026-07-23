import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveEventPermissions } from "@/lib/auth/permissions";
import { createCsv, csvFilename } from "@/lib/exports/csv";

export async function GET(
  request: Request,
  context: RouteContext<"/api/events/[id]/exports">,
) {
  const { id } = await context.params;
  const type = new URL(request.url).searchParams.get("type") ?? "participants";
  if (type !== "participants" && type !== "medical")
    return Response.json({ error: "Exportación no válida" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { data: role } = await supabase.rpc("get_event_role", {
    target_event_id: id,
  });
  const permissions = resolveEventPermissions(role);
  const authorized =
    type === "medical"
      ? permissions.canExportMedical
      : permissions.canExportParticipants;
  if (!authorized)
    return Response.json(
      { error: "No tienes permiso para exportar estos datos" },
      { status: 403 },
    );

  const admin = createAdminClient();
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id,title")
    .eq("id", id)
    .maybeSingle();
  if (eventError || !event)
    return Response.json({ error: "Evento no encontrado" }, { status: 404 });

  const { data: registrations, error: registrationsError } = await admin
    .from("registrations")
    .select(
      "id,participant_name,participant_email,participant_phone,participant_age,participant_type,payment_status,registration_status,total_amount,currency,created_at,event_programs(name),registration_periods(event_periods(label))",
    )
    .eq("event_id", event.id)
    .order("created_at", { ascending: false });
  if (registrationsError) throw registrationsError;

  let rows: unknown[][];
  if (type === "medical") {
    const registrationIds = (registrations ?? []).map((item) => item.id);
    const [{ data: sensitive = [] }, { data: answers = [] }] =
      registrationIds.length
        ? await Promise.all([
            admin
              .from("registration_sensitive_data")
              .select("registration_id,allergies,medical_notes")
              .in("registration_id", registrationIds),
            admin
              .from("registration_sensitive_answers")
              .select("registration_id,field_key,answer")
              .in("registration_id", registrationIds),
          ])
        : [{ data: [] }, { data: [] }];
    const sensitiveByRegistration = new Map(
      (sensitive ?? []).map((item) => [item.registration_id, item]),
    );
    const answersByRegistration = new Map<string, string[]>();
    for (const answer of answers ?? []) {
      const values = answersByRegistration.get(answer.registration_id) ?? [];
      values.push(`${answer.field_key}: ${formatAnswer(answer.answer)}`);
      answersByRegistration.set(answer.registration_id, values);
    }
    rows = [
      ["Participante", "Alergias", "Información médica", "Respuestas médicas"],
      ...(registrations ?? []).map((registration) => {
        const medical = sensitiveByRegistration.get(registration.id);
        return [
          registration.participant_name,
          medical?.allergies,
          medical?.medical_notes,
          answersByRegistration.get(registration.id)?.join(" | "),
        ];
      }),
    ];
  } else {
    rows = [
      [
        "Participante",
        "Email",
        "Teléfono",
        "Edad",
        "Tipo",
        "Programa",
        "Periodos",
        "Total",
        "Moneda",
        "Pago",
        "Estado",
        "Fecha de inscripción",
      ],
      ...(registrations ?? []).map((registration) => [
        registration.participant_name,
        registration.participant_email,
        registration.participant_phone,
        registration.participant_age,
        registration.participant_type,
        firstRelation(registration.event_programs)?.name,
        registration.registration_periods
          ?.map(
            (selection) => firstRelation(selection.event_periods)?.label,
          )
          .filter(Boolean)
          .join(" | "),
        registration.total_amount,
        registration.currency,
        registration.payment_status,
        registration.registration_status,
        registration.created_at,
      ]),
    ];
  }

  await admin.from("data_export_audit").insert({
    event_id: event.id,
    requested_by: user.id,
    export_type: type,
    row_count: registrations?.length ?? 0,
  });

  const filename = `${csvFilename(event.title)}-${type === "medical" ? "medico" : "participantes"}.csv`;
  return new Response(createCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function formatAnswer(answer: unknown) {
  if (Array.isArray(answer)) return answer.join(", ");
  if (answer && typeof answer === "object") return JSON.stringify(answer);
  return String(answer ?? "");
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

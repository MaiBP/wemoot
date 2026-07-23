import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  organizationMemberSchema,
  organizationMemberUpdateSchema,
} from "@/lib/validations";

const allRoles = [
  "owner",
  "admin",
  "registration_manager",
  "coach",
  "medical_staff",
  "viewer",
];

async function authorize(organizationId: string, manage = false) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      error: Response.json({ error: "No autorizado" }, { status: 401 }),
    };
  const { data: allowed } = await supabase.rpc("has_organization_role", {
    target_organization_id: organizationId,
    allowed_roles: manage ? ["owner", "admin"] : allRoles,
  });
  if (!allowed)
    return {
      error: Response.json(
        { error: "No tienes permiso para gestionar este equipo" },
        { status: 403 },
      ),
    };
  return { user };
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/organizations/[id]/members">,
) {
  const { id } = await context.params;
  const authorization = await authorize(id);
  if (authorization.error) return authorization.error;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_members")
    .select("id,profile_id,role,status,created_at,profiles(full_name,email)")
    .eq("organization_id", id)
    .order("created_at");
  return Response.json(error ? { error: error.message } : { members: data }, {
    status: error ? 400 : 200,
  });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/organizations/[id]/members">,
) {
  const { id } = await context.params;
  const authorization = await authorize(id, true);
  if (authorization.error) return authorization.error;
  const parsed = organizationMemberSchema.safeParse(await request.json());
  if (!parsed.success)
    return Response.json({ error: "Email o rol no válido" }, { status: 400 });
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", parsed.data.email)
    .maybeSingle();
  if (!profile)
    return Response.json(
      { error: "La persona debe crear primero una cuenta en WeMoot" },
      { status: 404 },
    );
  const { error } = await admin.from("organization_members").upsert(
    {
      organization_id: id,
      profile_id: profile.id,
      role: parsed.data.role,
      status: "active",
      invited_by: authorization.user?.id,
    },
    { onConflict: "organization_id,profile_id" },
  );
  return Response.json(error ? { error: error.message } : { ok: true }, {
    status: error ? 400 : 201,
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/organizations/[id]/members">,
) {
  const { id } = await context.params;
  const authorization = await authorize(id, true);
  if (authorization.error) return authorization.error;
  const parsed = organizationMemberUpdateSchema.safeParse(await request.json());
  if (!parsed.success)
    return Response.json({ error: "Cambio no válido" }, { status: 400 });
  const admin = createAdminClient();
  const { data: current } = await admin
    .from("organization_members")
    .select("id,role")
    .eq("id", parsed.data.member_id)
    .eq("organization_id", id)
    .maybeSingle();
  if (!current)
    return Response.json({ error: "Miembro no encontrado" }, { status: 404 });
  if (current.role === "owner")
    return Response.json(
      { error: "El propietario no puede modificarse aquí" },
      { status: 400 },
    );
  const changes = {
    ...(parsed.data.role ? { role: parsed.data.role } : {}),
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
  };
  const { error } = await admin
    .from("organization_members")
    .update(changes)
    .eq("id", current.id);
  return Response.json(error ? { error: error.message } : { ok: true }, {
    status: error ? 400 : 200,
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/organizations/[id]/members">,
) {
  const { id } = await context.params;
  const authorization = await authorize(id, true);
  if (authorization.error) return authorization.error;
  const memberId = new URL(request.url).searchParams.get("member_id");
  if (!memberId)
    return Response.json({ error: "Falta el miembro" }, { status: 400 });
  const admin = createAdminClient();
  const { data: current } = await admin
    .from("organization_members")
    .select("id,role")
    .eq("id", memberId)
    .eq("organization_id", id)
    .maybeSingle();
  if (!current)
    return Response.json({ error: "Miembro no encontrado" }, { status: 404 });
  if (current.role === "owner")
    return Response.json(
      { error: "El propietario no puede eliminarse" },
      { status: 400 },
    );
  const { error } = await admin
    .from("organization_members")
    .delete()
    .eq("id", current.id);
  return Response.json(error ? { error: error.message } : { ok: true }, {
    status: error ? 400 : 200,
  });
}

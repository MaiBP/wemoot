import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TeamManager,
  type TeamMember,
} from "@/components/dashboard/team-manager";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: organizations = [] } = await supabase
    .from("organizations")
    .select("id,name")
    .order("created_at")
    .limit(1);
  const organization = organizations?.[0];
  let members: TeamMember[] = [];
  let canManage = false;
  if (organization) {
    const { data: allowed } = await supabase.rpc("has_organization_role", {
      target_organization_id: organization.id,
      allowed_roles: ["owner", "admin"],
    });
    canManage = Boolean(allowed);
    const admin = createAdminClient();
    const result = await admin
      .from("organization_members")
      .select("id,role,status,profiles(full_name,email)")
      .eq("organization_id", organization.id)
      .order("created_at");
    members = (result.data ?? []) as unknown as TeamMember[];
  }
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7">
        <h1 className="text-3xl font-bold tracking-tight">Equipo y permisos</h1>
        <p className="mt-1 text-brand-black/60">
          Controla quién accede a eventos, pagos y datos médicos.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{organization?.name ?? "Equipo WeMoot"}</CardTitle>
        </CardHeader>
        <CardContent>
          {organization ? (
            <TeamManager
              organizationId={organization.id}
              initialMembers={members}
              canManage={canManage}
            />
          ) : (
            <p className="py-8 text-center text-brand-black/60">
              La organización se creará al aplicar la migración de la fase 6.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

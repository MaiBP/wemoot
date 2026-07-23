"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { roleLabels, type EventRole } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface TeamMember {
  id: string;
  role: EventRole;
  status: "active" | "disabled";
  profiles: { full_name: string | null; email: string | null } | null;
}

const assignableRoles: Exclude<EventRole, "owner">[] = [
  "admin",
  "registration_manager",
  "coach",
  "medical_staff",
  "viewer",
];

export function TeamManager({
  organizationId,
  initialMembers,
  canManage,
}: {
  organizationId: string;
  initialMembers: TeamMember[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const response = await fetch(
      `/api/organizations/${organizationId}/members`,
    );
    const result = await response.json();
    if (response.ok) setMembers(result.members ?? []);
    router.refresh();
  }

  async function add(formData: FormData) {
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/organizations/${organizationId}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData)),
      },
    );
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "No se pudo añadir el miembro");
    else await reload();
    setBusy(false);
  }

  async function update(memberId: string, changes: Record<string, string>) {
    setError("");
    const response = await fetch(
      `/api/organizations/${organizationId}/members`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId, ...changes }),
      },
    );
    const result = await response.json();
    if (!response.ok)
      setError(result.error ?? "No se pudo actualizar el miembro");
    else await reload();
  }

  async function remove(memberId: string) {
    if (!confirm("¿Eliminar a esta persona del equipo?")) return;
    const response = await fetch(
      `/api/organizations/${organizationId}/members?member_id=${memberId}`,
      { method: "DELETE" },
    );
    const result = await response.json();
    if (!response.ok)
      setError(result.error ?? "No se pudo eliminar el miembro");
    else await reload();
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <form
          action={add}
          className="grid gap-3 rounded-xl bg-brand-black/[0.03] p-4 md:grid-cols-[1fr_240px_auto]"
        >
          <Input
            name="email"
            type="email"
            required
            placeholder="persona@club.com"
          />
          <select
            name="role"
            className="rounded-lg border border-brand-black/15 bg-white px-3 text-sm"
          >
            {assignableRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
          <Button disabled={busy}>{busy ? "Añadiendo…" : "Añadir"}</Button>
          <p className="text-xs text-brand-black/50 md:col-span-3">
            La persona debe haberse registrado previamente en WeMoot con ese
            email.
          </p>
        </form>
      )}
      {error && (
        <p className="rounded-lg bg-brand-magenta/10 p-3 text-sm">{error}</p>
      )}
      <div className="divide-y divide-brand-black/10">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex flex-wrap items-center gap-3 py-4"
          >
            <div className="min-w-52 flex-1">
              <p className="font-medium">
                {member.profiles?.full_name ||
                  member.profiles?.email ||
                  "Usuario"}
              </p>
              {member.profiles?.full_name && (
                <p className="text-sm text-brand-black/50">
                  {member.profiles.email}
                </p>
              )}
            </div>
            {member.role === "owner" || !canManage ? (
              <Badge>{roleLabels[member.role]}</Badge>
            ) : (
              <>
                <select
                  value={member.role}
                  onChange={(event) =>
                    update(member.id, { role: event.target.value })
                  }
                  className="rounded-lg border border-brand-black/15 bg-white p-2 text-sm"
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
                <select
                  value={member.status}
                  onChange={(event) =>
                    update(member.id, { status: event.target.value })
                  }
                  className="rounded-lg border border-brand-black/15 bg-white p-2 text-sm"
                >
                  <option value="active">Activo</option>
                  <option value="disabled">Desactivado</option>
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(member.id)}
                  aria-label="Eliminar miembro"
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

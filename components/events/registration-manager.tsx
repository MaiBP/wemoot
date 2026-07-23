"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search, ShieldCheck } from "lucide-react";
import type { RegistrationRecord } from "@/types/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function RegistrationManager({
  eventId,
  registrations,
  canManage,
  canViewPayments,
  canExportParticipants,
  canExportMedical,
}: {
  eventId: string;
  eventTitle: string;
  registrations: RegistrationRecord[];
  canManage: boolean;
  canViewPayments: boolean;
  canExportParticipants: boolean;
  canExportMedical: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");

  const programNames = useMemo(
    () =>
      Array.from(
        new Set(
          registrations
            .map((registration) => programName(registration))
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [registrations],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return registrations.filter((registration) => {
      const matchesQuery =
        !normalizedQuery ||
        registration.participant_name
          .toLocaleLowerCase("es")
          .includes(normalizedQuery) ||
        registration.participant_email
          ?.toLocaleLowerCase("es")
          .includes(normalizedQuery);
      const matchesPayment =
        paymentFilter === "all" ||
        registration.payment_status === paymentFilter;
      const matchesProgram =
        programFilter === "all" || programName(registration) === programFilter;
      return matchesQuery && matchesPayment && matchesProgram;
    });
  }, [paymentFilter, programFilter, query, registrations]);

  async function add(formData: FormData) {
    setBusy(true);
    const response = await fetch("/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...Object.fromEntries(formData),
        event_id: eventId,
      }),
    });
    const result = await response.json();
    if (!response.ok)
      alert(result.error ?? "No se pudo guardar la inscripción");
    else setAdding(false);
    setBusy(false);
    router.refresh();
  }

  async function setStatus(id: string, status: string) {
    const response = await fetch("/api/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registration_id: id, status }),
    });
    const result = await response.json();
    if (!response.ok) alert(result.error ?? "No se pudo cambiar el estado");
    router.refresh();
  }

  async function certificates() {
    setBusy(true);
    const response = await fetch("/api/certificates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId }),
    });
    const result = await response.json();
    alert(
      response.ok
        ? `${result.prepared ?? 0} certificados preparados.`
        : (result.error ?? "No se pudieron preparar los certificados"),
    );
    setBusy(false);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {canManage && (
          <Button size="sm" onClick={() => setAdding(!adding)}>
            Añadir inscrito
          </Button>
        )}
        {canExportParticipants && registrations.length > 0 && (
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/events/${eventId}/exports?type=participants`}>
              <Download className="size-4" /> Exportar participantes
            </a>
          </Button>
        )}
        {canExportMedical && registrations.length > 0 && (
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/events/${eventId}/exports?type=medical`}>
              <ShieldCheck className="size-4" /> Exportación médica
            </a>
          </Button>
        )}
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={certificates}
            disabled={busy || !registrations.length}
          >
            Preparar certificados
          </Button>
        )}
      </div>

      {adding && canManage && (
        <form
          action={add}
          className="mb-5 grid gap-3 rounded-xl bg-brand-black/[0.03] p-4 md:grid-cols-2"
        >
          <Input
            name="participant_name"
            required
            placeholder="Nombre y apellidos"
          />
          <Input name="participant_email" type="email" placeholder="Email" />
          <Input name="participant_phone" placeholder="Teléfono" />
          <Input name="participant_age" type="number" placeholder="Edad" />
          <div className="flex gap-2 md:col-span-2">
            <Button size="sm" disabled={busy}>
              Guardar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAdding(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {registrations.length > 0 && (
        <div className="mb-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_220px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-black/40" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar participante o email"
              className="pl-9"
            />
          </label>
          {canViewPayments && (
            <select
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value)}
              className="rounded-lg border border-brand-black/15 bg-white px-3 text-sm"
              aria-label="Filtrar por pago"
            >
              <option value="all">Todos los pagos</option>
              <option value="pending">Pendientes</option>
              <option value="paid">Pagados</option>
              <option value="cancelled">Cancelados</option>
            </select>
          )}
          {programNames.length > 0 && (
            <select
              value={programFilter}
              onChange={(event) => setProgramFilter(event.target.value)}
              className="rounded-lg border border-brand-black/15 bg-white px-3 text-sm"
              aria-label="Filtrar por programa"
            >
              <option value="all">Todos los programas</option>
              {programNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {!registrations.length ? (
        <p className="py-8 text-center text-sm text-brand-black/60">
          Todavía no hay inscritos.
        </p>
      ) : !filtered.length ? (
        <p className="py-8 text-center text-sm text-brand-black/60">
          No hay resultados para estos filtros.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-brand-black/45">
              <tr>
                <th className="py-3">Participante</th>
                <th>Contacto</th>
                {canViewPayments && <th>Pago</th>}
                {canManage && <th className="text-right">Cambiar estado</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((registration) => (
                <tr key={registration.id}>
                  <td className="py-4 font-medium">
                    {registration.participant_name}
                    {registration.participant_age ? (
                      <span className="block text-xs font-normal text-brand-black/45">
                        {registration.participant_age} años
                      </span>
                    ) : null}
                    {programName(registration) && (
                      <span className="block text-xs font-normal text-brand-cyan">
                        {programName(registration)}
                        {periodNames(registration)
                          ? ` · ${periodNames(registration)}`
                          : ""}
                      </span>
                    )}
                  </td>
                  <td className="text-brand-black/60">
                    {registration.participant_email ||
                      registration.participant_phone ||
                      "—"}
                  </td>
                  {canViewPayments && (
                    <td>
                      <Badge
                        variant={paymentVariant(registration.payment_status)}
                      >
                        {registration.payment_status}
                      </Badge>
                    </td>
                  )}
                  {canManage && (
                    <td className="text-right">
                      <select
                        value={registration.payment_status}
                        onChange={(event) =>
                          setStatus(registration.id, event.target.value)
                        }
                        className="rounded-lg border border-brand-black/15 bg-white p-2 text-xs"
                        aria-label={`Estado de pago de ${registration.participant_name}`}
                      >
                        <option value="pending">Pendiente</option>
                        <option value="paid">Pagado</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function programName(registration: RegistrationRecord) {
  return (
    registration.registration_items?.[0]?.event_programs?.name ??
    registration.event_programs?.name ??
    null
  );
}

function periodNames(registration: RegistrationRecord) {
  return (
    registration.registration_items?.[0]?.event_periods?.label ??
    registration.registration_periods
      ?.map((item) => item.event_periods?.label)
      .filter(Boolean)
      .join(", ") ??
    ""
  );
}

function paymentVariant(status: RegistrationRecord["payment_status"]) {
  if (status === "paid") return "success" as const;
  if (status === "cancelled") return "danger" as const;
  return "warning" as const;
}

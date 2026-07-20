"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RegistrationRecord } from "@/types/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
export function RegistrationManager({
  eventId,
  eventTitle,
  registrations,
}: {
  eventId: string;
  eventTitle: string;
  registrations: RegistrationRecord[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  async function add(formData: FormData) {
    setBusy(true);
    await fetch("/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...Object.fromEntries(formData),
        event_id: eventId,
      }),
    });
    setAdding(false);
    setBusy(false);
    router.refresh();
  }
  async function setStatus(id: string, status: string) {
    await fetch("/api/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registration_id: id, status }),
    });
    router.refresh();
  }
  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Nombre", "Email", "Teléfono", "Edad", "Pago", "Modalidad", "Periodo", "Tarifa"],
      ...registrations.map((r) => [
        r.participant_name,
        r.participant_email,
        r.participant_phone,
        r.participant_age,
        r.payment_status,
        r.registration_items?.[0]?.event_programs?.name,
        r.registration_items?.[0]?.event_periods?.label,
        r.registration_items?.[0]?.event_prices?.label,
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(esc).join(",")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${eventTitle.toLowerCase().replace(/\W+/g, "-")}-inscritos.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function certificates() {
    setBusy(true);
    const r = await fetch("/api/certificates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId }),
    });
    const data = await r.json();
    alert(`${data.prepared ?? 0} certificados preparados.`);
    setBusy(false);
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setAdding(!adding)}>
          Añadir inscrito
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={exportCsv}
          disabled={!registrations.length}
        >
          Exportar CSV
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={certificates}
          disabled={busy || !registrations.length}
        >
          Preparar certificados
        </Button>
      </div>
      {adding && (
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
      {!registrations.length ? (
        <p className="py-8 text-center text-sm text-brand-black/60">
          Todavía no hay inscritos.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-brand-black/45">
              <tr>
                <th className="py-3">Participante</th>
                <th>Contacto</th>
                <th>Pago</th>
                <th className="text-right">Cambiar estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {registrations.map((r) => (
                <tr key={r.id}>
                  <td className="py-4 font-medium">
                    {r.participant_name}
                    {r.participant_age ? (
                      <span className="block text-xs font-normal text-brand-black/45">
                        {r.participant_age} años
                      </span>
                    ) : null}
                    {r.registration_items?.[0] && (
                      <span className="block text-xs font-normal text-brand-cyan">
                        {r.registration_items[0].event_programs?.name}
                        {r.registration_items[0].event_periods?.label
                          ? ` · ${r.registration_items[0].event_periods.label}`
                          : ""}
                        {r.registration_items[0].event_prices?.label
                          ? ` · ${r.registration_items[0].event_prices.label}`
                          : ""}
                      </span>
                    )}
                  </td>
                  <td className="text-brand-black/60">
                    {r.participant_email || r.participant_phone || "—"}
                  </td>
                  <td>
                    <Badge
                      variant={
                        r.payment_status === "paid"
                          ? "success"
                          : r.payment_status === "cancelled"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {r.payment_status}
                    </Badge>
                  </td>
                  <td className="text-right">
                    <select
                      value={r.payment_status}
                      onChange={(e) => setStatus(r.id, e.target.value)}
                      className="rounded-lg border border-brand-black/15 bg-white p-2 text-xs"
                    >
                      <option value="pending">Pendiente</option>
                      <option value="paid">Pagado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

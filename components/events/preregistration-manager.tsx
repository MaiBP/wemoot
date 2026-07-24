"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PreregistrationManager({
  eventId,
  mode,
  allowMultiplePrograms,
  limit,
  invitationHours,
  paymentOpenedAt,
  stats,
}: {
  eventId: string;
  mode: "direct" | "preregistration";
  allowMultiplePrograms: boolean;
  limit: number;
  invitationHours: number;
  paymentOpenedAt: string | null;
  stats: {
    total: number;
    waiting: number;
    invited: number;
    confirmed: number;
    expired: number;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(formData: FormData) {
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/events/${eventId}/preregistration`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    const result = await response.json();
    setMessage(response.ok ? "Configuración guardada." : result.error);
    setBusy(false);
    router.refresh();
  }

  async function run(action: "open" | "process") {
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/events/${eventId}/preregistration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await response.json();
    setMessage(
      response.ok
        ? `${result.invited ?? 0} invitaciones enviadas · ${result.expired ?? 0} vencidas · ${result.waiting ?? 0} en espera`
        : result.error,
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form action={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="registration-mode">Tipo de inscripción</Label>
          <select
            id="registration-mode"
            name="registration_mode"
            defaultValue={mode}
            className="h-11 w-full rounded-xl border bg-white px-3"
          >
            <option value="direct">Inscripción y pago directo</option>
            <option value="preregistration">Preinscripción por orden</option>
          </select>
        </div>
        <div>
          <Label htmlFor="allow-multiple-programs">
            Modalidades por participante
          </Label>
          <select
            id="allow-multiple-programs"
            name="allow_multiple_programs"
            defaultValue={String(allowMultiplePrograms)}
            className="h-11 w-full rounded-xl border bg-white px-3"
          >
            <option value="true">Una o varias</option>
            <option value="false">Solo una</option>
          </select>
        </div>
        <div>
          <Label htmlFor="preregistration-limit">
            Máximo de preinscripciones
          </Label>
          <Input
            id="preregistration-limit"
            name="preregistration_limit"
            type="number"
            min="1"
            defaultValue={limit}
          />
        </div>
        <div>
          <Label htmlFor="invitation-hours">Horas para pagar</Label>
          <Input
            id="invitation-hours"
            name="payment_invitation_hours"
            type="number"
            min="1"
            max="24"
            defaultValue={invitationHours}
          />
        </div>
        <Button
          disabled={busy}
          className="sm:col-span-2 lg:col-span-4 lg:w-fit"
        >
          Guardar configuración
        </Button>
      </form>

      {mode === "preregistration" && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Total" value={stats.total} />
            <Stat label="En espera" value={stats.waiting} />
            <Stat label="Invitados" value={stats.invited} />
            <Stat label="Confirmados" value={stats.confirmed} />
            <Stat label="Vencidos" value={stats.expired} />
          </div>
          <div className="flex flex-wrap gap-2">
            {!paymentOpenedAt ? (
              <Button
                disabled={busy || stats.waiting === 0}
                onClick={() => run("open")}
              >
                Abrir pagos e invitar
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => run("process")}>
                Procesar vencimientos y lista
              </Button>
            )}
            {paymentOpenedAt && (
              <p className="self-center text-sm text-brand-black/55">
                Pagos abiertos desde{" "}
                {new Date(paymentOpenedAt).toLocaleString("es-ES")}
              </p>
            )}
          </div>
        </>
      )}
      {message && (
        <p className="rounded-xl bg-brand-cyan/10 p-3 text-sm">{message}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-brand-black/[0.04] p-3">
      <span className="block text-xs text-brand-black/50">{label}</span>
      <strong className="text-xl">{value}</strong>
    </div>
  );
}

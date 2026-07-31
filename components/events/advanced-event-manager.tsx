"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type {
  EventPeriod,
  EventProgram,
  EventProgramPeriod,
} from "@/types/event";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const turnNames = {
  morning: "Mañana",
  afternoon: "Tarde",
  full_day: "Todo el día",
  custom: "Personalizado",
};
export function AdvancedEventManager({
  eventId,
  programs,
  periods,
  programPeriods,
}: {
  eventId: string;
  programs: EventProgram[];
  periods: EventPeriod[];
  programPeriods: EventProgramPeriod[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"program" | "period" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(kind: "program" | "period", formData: FormData) {
    setBusy(true);
    setError("");
    const raw = Object.fromEntries(formData);
    const data: Record<string, unknown> = { ...raw };
    for (const key of [
      "min_age",
      "max_age",
      "min_birth_year",
      "max_birth_year",
      "category",
      "period_id",
      "payment_due_date",
      "start_time",
      "end_time",
    ]) {
      if (!data[key]) data[key] = null;
    }
    if (kind === "program") {
      data.included_items = String(raw.included_items ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    const response = await fetch(`/api/events/${eventId}/structure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, data }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "No se pudo guardar");
      return;
    }
    setOpen(null);
    router.refresh();
  }

  async function remove(kind: "program" | "period", id: string) {
    if (!confirm("¿Quieres eliminar esta opción?")) return;
    const response = await fetch(
      `/api/events/${eventId}/structure?kind=${kind}&record_id=${id}`,
      { method: "DELETE" },
    );
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "No se pudo eliminar");
    router.refresh();
  }

  async function saveAvailability(
    relation: EventProgramPeriod,
    formData: FormData,
  ) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/events/${eventId}/structure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "availability",
        data: {
          id: relation.id,
          program_id: relation.program_id,
          period_id: relation.period_id,
          capacity: formData.get("capacity") || null,
          is_available: formData.get("is_available") === "on",
        },
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "No se pudo guardar la disponibilidad");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-7">
      {error && (
        <p className="rounded-xl bg-brand-magenta/10 p-3 text-sm">{error}</p>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Modalidades</h3>
            <p className="text-sm text-brand-black/50">
              Turnos, edades, capacidad y regla de pago.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(open === "program" ? null : "program")}
          >
            <Plus className="size-4" /> Añadir
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {programs.map((program) => (
            <div
              key={program.id}
              className="rounded-xl border border-brand-black/10 p-4"
            >
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-semibold">{program.name}</p>
                  <p className="mt-1 text-sm text-brand-black/55">
                    {turnNames[program.turn]}
                    {program.start_time
                      ? ` · ${program.start_time.slice(0, 5)}–${program.end_time?.slice(0, 5) ?? "?"}`
                      : ""}{" "}
                    · {program.capacity} plazas
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Eliminar modalidad"
                  onClick={() => remove("program", program.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {program.category && <Badge>{program.category}</Badge>}
                <Badge>
                  {program.payment_timing === "immediate"
                    ? "Pago inmediato"
                    : program.payment_timing === "reserve"
                      ? "Sólo reserva"
                      : "Pago diferido"}
                </Badge>
                {(program.min_age || program.max_age) && (
                  <Badge variant="warning">
                    {program.min_age && program.max_age
                      ? `${program.min_age}–${program.max_age} años`
                      : program.min_age
                        ? `Desde ${program.min_age} años`
                        : `Hasta ${program.max_age} años`}
                  </Badge>
                )}
              </div>
            </div>
          ))}
          {!programs.length && (
            <p className="text-sm text-brand-black/50">
              Añade la primera modalidad del campus.
            </p>
          )}
        </div>
        {open === "program" && (
          <form
            action={(data) => save("program", data)}
            className="mt-4 grid gap-3 rounded-xl bg-brand-black/[.03] p-4 md:grid-cols-3"
          >
            <div className="md:col-span-2">
              <Label>Nombre</Label>
              <Input name="name" required placeholder="Perfeccionamiento" />
            </div>
            <div>
              <Label>Categoría</Label>
              <Input name="category" placeholder="Tecnificación" />
            </div>
            <div>
              <Label>Turno</Label>
              <select
                name="turn"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="morning">Mañana</option>
                <option value="afternoon">Tarde</option>
                <option value="full_day">Todo el día</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>
            <div>
              <Label>Inicio</Label>
              <Input name="start_time" type="time" />
            </div>
            <div>
              <Label>Final</Label>
              <Input name="end_time" type="time" />
            </div>
            <div>
              <Label>Plazas</Label>
              <Input name="capacity" type="number" min="1" required />
            </div>
            <div>
              <Label>Edad mínima</Label>
              <Input name="min_age" type="number" min="3" />
            </div>
            <div>
              <Label>Edad máxima</Label>
              <Input name="max_age" type="number" min="3" />
            </div>
            <div>
              <Label>Año nacimiento mínimo</Label>
              <Input
                name="min_birth_year"
                type="number"
                min="1900"
                max="2200"
              />
            </div>
            <div>
              <Label>Año nacimiento máximo</Label>
              <Input
                name="max_birth_year"
                type="number"
                min="1900"
                max="2200"
              />
            </div>
            <div>
              <Label>Pago</Label>
              <select
                name="payment_timing"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="immediate">Inmediato</option>
                <option value="reserve">Sólo reserva</option>
                <option value="deferred">Diferido</option>
              </select>
            </div>
            <div>
              <Label>Fecha de cobro</Label>
              <Input name="payment_due_date" type="date" />
            </div>
            <div className="md:col-span-2">
              <Label>Material incluido (separado por comas)</Label>
              <Input name="included_items" placeholder="Camiseta, pantalón" />
            </div>
            <div className="flex items-end">
              <Button disabled={busy}>Guardar modalidad</Button>
            </div>
          </form>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Periodos</h3>
            <p className="text-sm text-brand-black/50">
              Semanas o bloques seleccionables.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(open === "period" ? null : "period")}
          >
            <Plus className="size-4" /> Añadir
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {periods.map((period) => (
            <span
              key={period.id}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
            >
              <strong>{period.label}</strong> · {period.start_date} –{" "}
              {period.end_date}
              <button
                aria-label="Eliminar periodo"
                onClick={() => remove("period", period.id)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
          {!periods.length && (
            <p className="text-sm text-brand-black/50">
              No hay periodos configurados.
            </p>
          )}
        </div>
        {open === "period" && (
          <form
            action={(data) => save("period", data)}
            className="mt-4 grid gap-3 rounded-xl bg-brand-black/[.03] p-4 md:grid-cols-4"
          >
            <div>
              <Label>Etiqueta</Label>
              <Input name="label" required placeholder="Semana 1" />
            </div>
            <div>
              <Label>Inicio</Label>
              <Input name="start_date" type="date" required />
            </div>
            <div>
              <Label>Final</Label>
              <Input name="end_date" type="date" required />
            </div>
            <div className="flex items-end">
              <Button disabled={busy}>Guardar periodo</Button>
            </div>
          </form>
        )}
      </section>

      <section>
        <div className="mb-3">
          <h3 className="font-semibold">
            Disponibilidad por modalidad y periodo
          </h3>
          <p className="text-sm text-brand-black/50">
            Define el aforo de cada combinación. Si lo dejas vacío, se usa el
            aforo general de la modalidad.
          </p>
        </div>
        {programPeriods.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-brand-black/45">
                <tr>
                  <th className="py-2">Modalidad</th>
                  <th>Periodo</th>
                  <th>Inscritos</th>
                  <th>Reservadas</th>
                  <th>Aforo</th>
                  <th>Disponible</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {programPeriods.map((relation) => {
                  const program = programs.find(
                    (item) => item.id === relation.program_id,
                  );
                  const period = periods.find(
                    (item) => item.id === relation.period_id,
                  );
                  return (
                    <tr key={relation.id}>
                      <td className="py-3 font-medium">
                        {program?.name ?? "Modalidad eliminada"}
                      </td>
                      <td>{period?.label ?? "Periodo eliminado"}</td>
                      <td>{relation.registered_count}</td>
                      <td>{relation.reserved_count ?? 0}</td>
                      <td colSpan={3}>
                        <form
                          action={(data) => saveAvailability(relation, data)}
                          className="flex min-w-72 items-center gap-3"
                        >
                          <Input
                            name="capacity"
                            type="number"
                            min="1"
                            defaultValue={relation.capacity ?? ""}
                            placeholder={String(program?.capacity ?? "")}
                            className="w-24"
                          />
                          <label className="flex items-center gap-2 whitespace-nowrap">
                            <input
                              name="is_available"
                              type="checkbox"
                              defaultChecked={relation.is_available}
                            />{" "}
                            Sí
                          </label>
                          <Button size="sm" variant="outline" disabled={busy}>
                            Guardar
                          </Button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-black/50">
            Añade al menos una modalidad y un periodo para configurar su
            disponibilidad.
          </p>
        )}
      </section>
    </div>
  );
}

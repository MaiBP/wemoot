"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { EventPeriod, EventPrice, EventProgram } from "@/types/event";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const turnNames = { morning: "Mañana", afternoon: "Tarde", full_day: "Todo el día", custom: "Personalizado" };
const audienceNames = { all: "Todos", member: "Socios", non_member: "No socios" };

export function AdvancedEventManager({
  eventId,
  programs,
  periods,
  prices,
}: {
  eventId: string;
  programs: EventProgram[];
  periods: EventPeriod[];
  prices: EventPrice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"program" | "period" | "price" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(kind: "program" | "period" | "price", formData: FormData) {
    setBusy(true);
    setError("");
    const raw = Object.fromEntries(formData);
    const data: Record<string, unknown> = { ...raw };
    for (const key of ["min_age", "max_age", "period_id", "payment_due_date", "start_time", "end_time"]) {
      if (!data[key]) data[key] = null;
    }
    if (kind === "program") {
      data.included_items = String(raw.included_items ?? "").split(",").map((item) => item.trim()).filter(Boolean);
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

  async function remove(kind: "program" | "period" | "price", id: string) {
    if (!confirm("¿Quieres eliminar esta opción?")) return;
    const response = await fetch(`/api/events/${eventId}/structure?kind=${kind}&record_id=${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "No se pudo eliminar");
    router.refresh();
  }

  return (
    <div className="space-y-7">
      {error && <p className="rounded-xl bg-brand-magenta/10 p-3 text-sm">{error}</p>}

      <section>
        <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Modalidades</h3><p className="text-sm text-brand-black/50">Turnos, edades, capacidad y regla de pago.</p></div><Button size="sm" variant="outline" onClick={() => setOpen(open === "program" ? null : "program")}><Plus className="size-4" /> Añadir</Button></div>
        <div className="grid gap-3 md:grid-cols-2">
          {programs.map((program) => <div key={program.id} className="rounded-xl border border-brand-black/10 p-4"><div className="flex justify-between gap-2"><div><p className="font-semibold">{program.name}</p><p className="mt-1 text-sm text-brand-black/55">{turnNames[program.turn]}{program.start_time ? ` · ${program.start_time.slice(0, 5)}–${program.end_time?.slice(0, 5) ?? "?"}` : ""} · {program.capacity} plazas</p></div><Button size="icon" variant="ghost" aria-label="Eliminar modalidad" onClick={() => remove("program", program.id)}><Trash2 className="size-4" /></Button></div><div className="mt-3 flex flex-wrap gap-2"><Badge>{program.payment_timing === "immediate" ? "Pago inmediato" : program.payment_timing === "reserve" ? "Sólo reserva" : "Pago diferido"}</Badge>{program.min_age && <Badge variant="warning">Desde {program.min_age} años</Badge>}</div></div>)}
          {!programs.length && <p className="text-sm text-brand-black/50">Añade la primera modalidad del campus.</p>}
        </div>
        {open === "program" && <form action={(data) => save("program", data)} className="mt-4 grid gap-3 rounded-xl bg-brand-black/[.03] p-4 md:grid-cols-3"><div className="md:col-span-2"><Label>Nombre</Label><Input name="name" required placeholder="Perfeccionamiento" /></div><div><Label>Turno</Label><select name="turn" className="h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="morning">Mañana</option><option value="afternoon">Tarde</option><option value="full_day">Todo el día</option><option value="custom">Personalizado</option></select></div><div><Label>Inicio</Label><Input name="start_time" type="time" /></div><div><Label>Final</Label><Input name="end_time" type="time" /></div><div><Label>Plazas</Label><Input name="capacity" type="number" min="1" required /></div><div><Label>Edad mínima</Label><Input name="min_age" type="number" min="3" /></div><div><Label>Edad máxima</Label><Input name="max_age" type="number" min="3" /></div><div><Label>Pago</Label><select name="payment_timing" className="h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="immediate">Inmediato</option><option value="reserve">Sólo reserva</option><option value="deferred">Diferido</option></select></div><div><Label>Fecha de cobro</Label><Input name="payment_due_date" type="date" /></div><div className="md:col-span-2"><Label>Material incluido (separado por comas)</Label><Input name="included_items" placeholder="Camiseta, pantalón" /></div><div className="flex items-end"><Button disabled={busy}>Guardar modalidad</Button></div></form>}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Periodos</h3><p className="text-sm text-brand-black/50">Semanas o bloques seleccionables.</p></div><Button size="sm" variant="outline" onClick={() => setOpen(open === "period" ? null : "period")}><Plus className="size-4" /> Añadir</Button></div>
        <div className="flex flex-wrap gap-2">{periods.map((period) => <span key={period.id} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><strong>{period.label}</strong> · {period.start_date} – {period.end_date}<button aria-label="Eliminar periodo" onClick={() => remove("period", period.id)}><Trash2 className="size-3.5" /></button></span>)}{!periods.length && <p className="text-sm text-brand-black/50">No hay periodos configurados.</p>}</div>
        {open === "period" && <form action={(data) => save("period", data)} className="mt-4 grid gap-3 rounded-xl bg-brand-black/[.03] p-4 md:grid-cols-4"><div><Label>Etiqueta</Label><Input name="label" required placeholder="Semana 1" /></div><div><Label>Inicio</Label><Input name="start_date" type="date" required /></div><div><Label>Final</Label><Input name="end_date" type="date" required /></div><div className="flex items-end"><Button disabled={busy}>Guardar periodo</Button></div></form>}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Tarifas</h3><p className="text-sm text-brand-black/50">El backend utilizará siempre estos importes.</p></div><Button size="sm" variant="outline" onClick={() => setOpen(open === "price" ? null : "price")} disabled={!programs.length}><Plus className="size-4" /> Añadir</Button></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase text-brand-black/45"><tr><th className="py-2">Modalidad</th><th>Tarifa</th><th>Periodo</th><th>Público</th><th>Precio</th><th /></tr></thead><tbody className="divide-y">{prices.map((price) => <tr key={price.id}><td className="py-3">{programs.find((item) => item.id === price.program_id)?.name}</td><td>{price.label}</td><td>{periods.find((item) => item.id === price.period_id)?.label ?? "Cualquiera"}</td><td>{audienceNames[price.audience]}</td><td className="font-semibold">{Number(price.amount).toFixed(2)} €</td><td><Button size="icon" variant="ghost" aria-label="Eliminar tarifa" onClick={() => remove("price", price.id)}><Trash2 className="size-4" /></Button></td></tr>)}</tbody></table>{!prices.length && <p className="py-4 text-sm text-brand-black/50">No hay tarifas configuradas.</p>}</div>
        {open === "price" && <form action={(data) => save("price", data)} className="mt-4 grid gap-3 rounded-xl bg-brand-black/[.03] p-4 md:grid-cols-3"><div><Label>Modalidad</Label><select name="program_id" required className="h-10 w-full rounded-xl border bg-white px-3 text-sm">{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></div><div><Label>Periodo</Label><select name="period_id" className="h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Cualquier periodo / bono</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}</select></div><div><Label>Tipo de participante</Label><select name="audience" className="h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="all">Todos</option><option value="member">Socios</option><option value="non_member">No socios</option></select></div><div><Label>Nombre de tarifa</Label><Input name="label" required placeholder="1 semana" /></div><div><Label>Precio (€)</Label><Input name="amount" type="number" min="0" step="0.01" required /></div><div className="flex items-end"><Button disabled={busy}>Guardar tarifa</Button></div></form>}
      </section>
    </div>
  );
}

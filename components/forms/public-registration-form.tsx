"use client";

import { useMemo, useState } from "react";
import { CreditCard, Loader2, WalletCards } from "lucide-react";
import type { EventPeriod, EventPrice, EventProgram } from "@/types/event";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function PublicRegistrationForm({
  eventId,
  price,
  programs = [],
  periods = [],
  prices = [],
}: {
  eventId: string;
  price: number;
  programs?: EventProgram[];
  periods?: EventPeriod[];
  prices?: EventPrice[];
}) {
  const advanced = programs.length > 0;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [audience, setAudience] = useState<"member" | "non_member">("non_member");
  const availablePrices = useMemo(
    () => prices.filter((item) => item.program_id === programId && (item.audience === "all" || item.audience === audience)),
    [prices, programId, audience],
  );
  const [priceId, setPriceId] = useState("");
  const selectedPrice = availablePrices.find((item) => item.id === priceId) ?? availablePrices[0];
  const selectedProgram = programs.find((item) => item.id === programId);
  const requiresPayment = !advanced || selectedProgram?.payment_timing === "immediate";
  const total = advanced ? Number(selectedPrice?.amount ?? 0) : price;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (advanced && (!selectedProgram || !selectedPrice)) {
      setError("Selecciona una modalidad y una tarifa disponibles.");
      return;
    }
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/public/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          participant_name: form.get("participant_name"),
          participant_email: form.get("participant_email"),
          participant_phone: form.get("participant_phone") || null,
          participant_age: null,
          participant_birth_date: form.get("participant_birth_date") || null,
          guardian_name: form.get("guardian_name") || null,
          club_member: advanced ? audience === "member" : null,
          current_club: form.get("current_club") || null,
          shirt_size: form.get("shirt_size") || null,
          allergies: form.get("allergies") || null,
          medical_notes: form.get("medical_notes") || null,
          image_consent: form.get("image_consent") === "on",
          notes: form.get("notes") || null,
          program_id: selectedProgram?.id ?? null,
          price_id: selectedPrice?.id ?? null,
          period_id: selectedPrice?.period_id || form.get("period_id") || null,
          payment_method: total === 0 || !requiresPayment ? "cash" : method,
          website: form.get("website"),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        checkout_url?: string;
        success_url?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "No pudimos completar la inscripción.");
      }
      const destination = data.checkout_url || data.success_url;
      if (!destination) throw new Error("No recibimos el enlace para continuar.");
      window.location.assign(destination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ha ocurrido un error.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {advanced && (
        <section className="space-y-4 rounded-2xl border border-brand-cyan/25 bg-brand-cyan/[.04] p-5">
          <h3 className="font-semibold">Elige tu programa</h3>
          <div>
            <Label htmlFor="program_id">Modalidad</Label>
            <select id="program_id" value={programId} onChange={(event) => { setProgramId(event.target.value); setPriceId(""); }} className="h-11 w-full rounded-xl border border-brand-black/15 bg-white px-3 text-sm">
              {programs.map((program) => <option key={program.id} value={program.id}>{program.name}{program.start_time ? ` · ${program.start_time.slice(0, 5)}–${program.end_time?.slice(0, 5) ?? "?"}` : ""}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="audience">Tipo de participante</Label>
            <select id="audience" value={audience} onChange={(event) => { setAudience(event.target.value as "member" | "non_member"); setPriceId(""); }} className="h-11 w-full rounded-xl border border-brand-black/15 bg-white px-3 text-sm">
              <option value="member">Jugador/a del club</option>
              <option value="non_member">No pertenece al club</option>
            </select>
          </div>
          <div>
            <Label htmlFor="price_id">Tarifa</Label>
            <select id="price_id" value={selectedPrice?.id ?? ""} onChange={(event) => setPriceId(event.target.value)} required className="h-11 w-full rounded-xl border border-brand-black/15 bg-white px-3 text-sm">
              {availablePrices.map((item) => <option key={item.id} value={item.id}>{item.label} · {formatCurrency(Number(item.amount))}</option>)}
            </select>
            {!availablePrices.length && <p className="mt-2 text-sm text-brand-magenta">No hay tarifas disponibles para esta selección.</p>}
          </div>
          {periods.length > 0 && !selectedPrice?.period_id && (
            <div>
              <Label htmlFor="period_id">Semana o periodo</Label>
              <select id="period_id" name="period_id" className="h-11 w-full rounded-xl border border-brand-black/15 bg-white px-3 text-sm">
                <option value="">No aplica / campus completo</option>
                {periods.map((period) => <option key={period.id} value={period.id}>{period.label} · {period.start_date}–{period.end_date}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-brand-cyan/20 pt-4"><span className="text-sm text-brand-black/60">Total</span><strong className="text-2xl">{formatCurrency(total)}</strong></div>
          {selectedProgram?.payment_timing !== "immediate" && <p className="rounded-xl bg-brand-yellow/30 p-3 text-sm">Esta modalidad reserva la plaza sin cobrar ahora{selectedProgram?.payment_due_date ? `; el pago se solicitará a partir del ${selectedProgram.payment_due_date}` : "."}</p>}
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="participant_name">Nombre y apellidos del participante</Label><Input id="participant_name" name="participant_name" required minLength={2} autoComplete="name" /></div>
        <div><Label htmlFor="participant_birth_date">Fecha de nacimiento{advanced ? " *" : ""}</Label><Input id="participant_birth_date" name="participant_birth_date" type="date" required={advanced} /></div>
        <div><Label htmlFor="guardian_name">Nombre del tutor/a{advanced ? " *" : ""}</Label><Input id="guardian_name" name="guardian_name" autoComplete="name" required={advanced} /></div>
        <div><Label htmlFor="participant_email">Email de contacto</Label><Input id="participant_email" name="participant_email" type="email" required autoComplete="email" /></div>
        <div><Label htmlFor="participant_phone">Teléfono</Label><Input id="participant_phone" name="participant_phone" type="tel" autoComplete="tel" /></div>
        {advanced && <><div><Label htmlFor="current_club">Club actual</Label><Input id="current_club" name="current_club" /></div><div><Label htmlFor="shirt_size">Talla de camiseta</Label><Input id="shirt_size" name="shirt_size" placeholder="8, 10, 12, S, M…" /></div><div className="sm:col-span-2"><Label htmlFor="allergies">Alergias</Label><Textarea id="allergies" name="allergies" /></div><div className="sm:col-span-2"><Label htmlFor="medical_notes">Observaciones médicas</Label><Textarea id="medical_notes" name="medical_notes" /></div></>}
        <div className="sm:col-span-2"><Label htmlFor="notes">Otras observaciones</Label><Textarea id="notes" name="notes" /></div>
      </div>

      {advanced && <label className="flex items-start gap-3 text-sm text-brand-black/65"><input type="checkbox" name="image_consent" className="mt-1" /><span>Autorizo el uso de imágenes del participante para la comunicación del evento.</span></label>}
      <div className="absolute -left-[10000px]" aria-hidden="true"><Label htmlFor="website">Sitio web</Label><Input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>

      {requiresPayment && total > 0 && (
        <fieldset><legend className="mb-2 text-sm font-medium text-brand-black/75">Forma de pago</legend><div className="grid gap-3 sm:grid-cols-2">
          <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${method === "cash" ? "border-brand-cyan bg-brand-cyan/10 ring-2 ring-brand-cyan/15" : "border-brand-black/15"}`}><input type="radio" value="cash" checked={method === "cash"} onChange={() => setMethod("cash")} /><WalletCards className="size-5 text-brand-cyan" /><span><strong className="block text-sm">Efectivo</strong><span className="text-xs text-brand-black/55">Pagarás al organizador</span></span></label>
          <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${method === "card" ? "border-brand-magenta bg-brand-magenta/5 ring-2 ring-brand-magenta/10" : "border-brand-black/15"}`}><input type="radio" value="card" checked={method === "card"} onChange={() => setMethod("card")} /><CreditCard className="size-5 text-brand-magenta" /><span><strong className="block text-sm">Tarjeta</strong><span className="text-xs text-brand-black/55">Pago seguro con Stripe</span></span></label>
        </div></fieldset>
      )}

      {error && <p role="alert" className="rounded-xl bg-brand-magenta/10 p-3 text-sm text-brand-black">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={loading || (advanced && !selectedPrice)}>{loading && <Loader2 className="size-4 animate-spin" />}{!requiresPayment ? "Solicitar plaza" : total === 0 ? "Confirmar inscripción" : method === "card" ? "Continuar al pago" : "Confirmar inscripción"}</Button>
      <p className="text-center text-xs leading-5 text-brand-black/45">Al inscribirte, autorizas al organizador a usar estos datos para gestionar tu participación.</p>
    </form>
  );
}

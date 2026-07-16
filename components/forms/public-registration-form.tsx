"use client";

import { useState } from "react";
import { CreditCard, Loader2, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function PublicRegistrationForm({ eventId, price }: { eventId: string; price: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState<"cash" | "card">("cash");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          participant_age: form.get("participant_age") || null,
          notes: form.get("notes") || null,
          payment_method: price === 0 ? "cash" : method,
          website: form.get("website"),
        }),
      });
      const data = (await response.json()) as { error?: string; checkout_url?: string; success_url?: string };
      if (!response.ok) throw new Error(data.error || "No pudimos completar la inscripción.");
      const destination = data.checkout_url || data.success_url;
      if (!destination) throw new Error("No recibimos el enlace para continuar.");
      window.location.assign(destination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ha ocurrido un error.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="participant_name">Nombre y apellidos</Label>
          <Input id="participant_name" name="participant_name" required minLength={2} autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="participant_email">Email</Label>
          <Input id="participant_email" name="participant_email" type="email" required autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="participant_phone">Teléfono</Label>
          <Input id="participant_phone" name="participant_phone" type="tel" autoComplete="tel" />
        </div>
        <div>
          <Label htmlFor="participant_age">Edad</Label>
          <Input id="participant_age" name="participant_age" type="number" min={3} max={100} inputMode="numeric" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notes">Observaciones</Label>
          <Textarea id="notes" name="notes" placeholder="Alergias, necesidades especiales u otra información útil" />
        </div>
      </div>

      <div className="absolute -left-[10000px]" aria-hidden="true">
        <Label htmlFor="website">Sitio web</Label>
        <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {price > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-brand-black/75">Forma de pago</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${method === "cash" ? "border-brand-cyan bg-brand-cyan/10 ring-2 ring-brand-cyan/15" : "border-brand-black/15"}`}>
              <input type="radio" name="payment_method" value="cash" checked={method === "cash"} onChange={() => setMethod("cash")} />
              <WalletCards className="size-5 text-brand-cyan" />
              <span><strong className="block text-sm">Efectivo</strong><span className="text-xs text-brand-black/55">Pagarás al organizador</span></span>
            </label>
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${method === "card" ? "border-brand-magenta bg-brand-magenta/5 ring-2 ring-brand-magenta/10" : "border-brand-black/15"}`}>
              <input type="radio" name="payment_method" value="card" checked={method === "card"} onChange={() => setMethod("card")} />
              <CreditCard className="size-5 text-brand-magenta" />
              <span><strong className="block text-sm">Tarjeta</strong><span className="text-xs text-brand-black/55">Pago seguro con Stripe</span></span>
            </label>
          </div>
        </fieldset>
      )}

      {error && <p role="alert" className="rounded-xl bg-brand-magenta/10 p-3 text-sm text-brand-black">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        {price === 0 ? "Confirmar inscripción" : method === "card" ? "Continuar al pago" : "Confirmar inscripción"}
      </Button>
      <p className="text-center text-xs leading-5 text-brand-black/45">
        Al inscribirte, autorizas al organizador a usar estos datos para gestionar tu participación.
      </p>
    </form>
  );
}

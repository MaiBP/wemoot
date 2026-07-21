"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type {
  EventDiscount,
  EventPeriod,
  EventPriceRule,
  EventProgram,
} from "@/types/event";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const participantNames: Record<string, string> = {
  general: "General",
  member: "Socio",
  non_member: "No socio",
  player: "Jugador",
  goalkeeper: "Portero",
  custom: "Personalizado",
};

const pricingNames: Record<string, string> = {
  fixed: "Precio fijo",
  per_period: "Por periodo",
  period_bundle: "Bono de periodos",
  full_event: "Campus completo",
  early_bird: "Promoción anticipada",
  manual: "Manual",
};

export function PricingRulesManager({
  eventId,
  programs,
  periods,
  rules,
  discounts,
}: {
  eventId: string;
  programs: EventProgram[];
  periods: EventPeriod[];
  rules: EventPriceRule[];
  discounts: EventDiscount[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"rule" | "discount" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(kind: "price_rule" | "discount", formData: FormData) {
    setBusy(true);
    setError("");
    const raw = Object.fromEntries(formData);
    const data: Record<string, unknown> = { ...raw, is_active: true };
    for (const key of [
      "program_id",
      "period_id",
      "quantity_from",
      "quantity_to",
      "label",
      "description",
      "code",
      "min_periods",
      "starts_at",
      "ends_at",
      "usage_limit",
    ]) {
      if (!data[key]) data[key] = null;
    }
    if (kind === "discount") {
      data.is_combinable = formData.get("is_combinable") === "on";
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

  async function remove(kind: "price_rule" | "discount", id: string) {
    if (!confirm("¿Quieres eliminar esta configuración?")) return;
    setError("");
    const response = await fetch(
      `/api/events/${eventId}/structure?kind=${kind}&record_id=${id}`,
      { method: "DELETE" },
    );
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "No se pudo eliminar");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-xl bg-brand-magenta/10 p-3 text-sm">{error}</p>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Reglas de precio</h3>
            <p className="text-sm text-brand-black/50">
              El backend elige una sola regla por prioridad y calcula en
              céntimos.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(open === "rule" ? null : "rule")}
          >
            <Plus className="size-4" /> Añadir
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-brand-black/45">
              <tr>
                <th className="py-2">Regla</th>
                <th>Modalidad</th>
                <th>Participante</th>
                <th>Cantidad</th>
                <th>Importe</th>
                <th>Prioridad</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="py-3">
                    <strong className="block">
                      {rule.label || pricingNames[rule.pricing_type]}
                    </strong>
                    <span className="text-xs text-brand-black/50">
                      {pricingNames[rule.pricing_type]}
                    </span>
                  </td>
                  <td>
                    {programs.find((item) => item.id === rule.program_id)
                      ?.name ?? "Todo el evento"}
                  </td>
                  <td>{participantNames[rule.participant_type]}</td>
                  <td>
                    {rule.quantity_from ?? "–"}
                    {rule.quantity_to !== rule.quantity_from
                      ? `–${rule.quantity_to ?? "∞"}`
                      : ""}
                  </td>
                  <td className="font-semibold">
                    {formatCurrency(Number(rule.amount))}
                  </td>
                  <td>{rule.priority}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {rule.legacy_price_id && <Badge>Importada</Badge>}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Eliminar regla"
                        onClick={() => remove("price_rule", rule.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rules.length && (
            <p className="py-4 text-sm text-brand-black/50">
              Todavía no hay reglas de precio.
            </p>
          )}
        </div>
        {open === "rule" && (
          <form
            action={(data) => save("price_rule", data)}
            className="mt-4 grid gap-3 rounded-xl bg-brand-black/[.03] p-4 md:grid-cols-3"
          >
            <div>
              <Label>Modalidad</Label>
              <select
                name="program_id"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="">Todo el evento</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Periodo específico</Label>
              <select
                name="period_id"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="">Cualquier periodo</option>
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Participante</Label>
              <select
                name="participant_type"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                {Object.entries(participantNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Tipo de precio</Label>
              <select
                name="pricing_type"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                {Object.entries(pricingNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Cantidad mínima</Label>
              <Input name="quantity_from" type="number" min="1" />
            </div>
            <div>
              <Label>Cantidad máxima</Label>
              <Input name="quantity_to" type="number" min="1" />
            </div>
            <div>
              <Label>Importe (€)</Label>
              <Input name="amount" type="number" min="0" step="0.01" required />
            </div>
            <div>
              <Label>Moneda</Label>
              <Input
                name="currency"
                defaultValue="EUR"
                maxLength={3}
                required
              />
            </div>
            <div>
              <Label>Prioridad</Label>
              <Input name="priority" type="number" defaultValue="0" />
            </div>
            <div>
              <Label>Inicio de vigencia</Label>
              <Input name="starts_at" type="datetime-local" />
            </div>
            <div>
              <Label>Fin de vigencia</Label>
              <Input name="ends_at" type="datetime-local" />
            </div>
            <div className="md:col-span-2">
              <Label>Nombre</Label>
              <Input name="label" placeholder="2 semanas socio" />
            </div>
            <div className="flex items-end">
              <Button disabled={busy}>Guardar regla</Button>
            </div>
          </form>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Descuentos</h3>
            <p className="text-sm text-brand-black/50">
              Los códigos se validan por fecha, uso, modalidad y compatibilidad.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(open === "discount" ? null : "discount")}
          >
            <Plus className="size-4" /> Añadir
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {discounts.map((discount) => (
            <div key={discount.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong>{discount.name}</strong>
                  <p className="mt-1 text-sm text-brand-black/55">
                    {discount.discount_type === "percentage"
                      ? `${Number(discount.discount_value)} %`
                      : formatCurrency(Number(discount.discount_value))}
                    {discount.code ? ` · ${discount.code}` : " · Automático"}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Eliminar descuento"
                  onClick={() => remove("discount", discount.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {!discounts.length && (
            <p className="text-sm text-brand-black/50">
              No hay descuentos configurados.
            </p>
          )}
        </div>
        {open === "discount" && (
          <form
            action={(data) => save("discount", data)}
            className="mt-4 grid gap-3 rounded-xl bg-brand-black/[.03] p-4 md:grid-cols-3"
          >
            <div>
              <Label>Nombre</Label>
              <Input name="name" required placeholder="Promoción verano" />
            </div>
            <div>
              <Label>Código</Label>
              <Input name="code" placeholder="VERANO10" />
            </div>
            <div>
              <Label>Modalidad</Label>
              <select
                name="program_id"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="">Todo el evento</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Tipo</Label>
              <select
                name="discount_type"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="percentage">Porcentaje</option>
                <option value="fixed_amount">Importe fijo</option>
                <option value="full_event">Campus completo</option>
                <option value="bundle">Bono</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <Label>Valor</Label>
              <Input
                name="discount_value"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <Label>Mínimo de periodos</Label>
              <Input name="min_periods" type="number" min="1" />
            </div>
            <div>
              <Label>Inicio</Label>
              <Input name="starts_at" type="datetime-local" />
            </div>
            <div>
              <Label>Fin</Label>
              <Input name="ends_at" type="datetime-local" />
            </div>
            <div>
              <Label>Límite de usos</Label>
              <Input name="usage_limit" type="number" min="1" />
            </div>
            <div>
              <Label>Prioridad</Label>
              <Input name="priority" type="number" defaultValue="0" />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input name="is_combinable" type="checkbox" /> Compatible con
              otros descuentos
            </label>
            <div className="flex items-end">
              <Button disabled={busy}>Guardar descuento</Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

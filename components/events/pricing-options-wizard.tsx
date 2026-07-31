"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import type { EventPeriod, EventPriceRule, EventProgram } from "@/types/event";
import {
  priceOptionName,
  summarizePriceOptions,
  type PriceOptionType,
} from "@/lib/pricing/price-option";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const optionTypes: Array<{
  value: PriceOptionType;
  title: string;
  description: string;
}> = [
  {
    value: "individual_periods",
    title: "Semanas sueltas",
    description: "Una o varias semanas con el mismo precio.",
  },
  {
    value: "full_event",
    title: "Campus completo",
    description: "Todas las semanas por un precio cerrado.",
  },
  {
    value: "weekly_sessions",
    title: "Pack semanal",
    description: "Una cantidad de sesiones por cada semana elegida.",
  },
  {
    value: "full_sessions",
    title: "Bono completo",
    description: "Todas las semanas con sesiones semanales definidas.",
  },
  {
    value: "single_event",
    title: "Evento único",
    description: "Una actividad sin combinaciones de semanas.",
  },
];

export function PricingOptionsWizard({
  eventId,
  programs,
  periods,
  rules,
}: {
  eventId: string;
  programs: EventProgram[];
  periods: EventPeriod[];
  rules: EventPriceRule[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [optionType, setOptionType] =
    useState<PriceOptionType>("individual_periods");
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [periodIds, setPeriodIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState(1);
  const [memberAmount, setMemberAmount] = useState("");
  const [nonMemberAmount, setNonMemberAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const summaries = useMemo(
    () => summarizePriceOptions(rules, programs, periods),
    [rules, programs, periods],
  );
  const previewName = priceOptionName(
    {
      option_type: optionType,
      program_id: programId,
      period_ids: periodIds,
      sessions_per_week: sessions,
      member_amount: Number(memberAmount || 0),
      non_member_amount: Number(nonMemberAmount || 0),
      currency: "EUR",
    },
    periods.length,
  );
  const selectedProgram =
    programs.find((program) => program.id === programId)?.name ??
    "Modalidad pendiente";

  async function saveOption(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const response = await fetch(`/api/events/${eventId}/structure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "price_option",
        data: {
          option_type: optionType,
          program_id: programId,
          period_ids: periodIds,
          sessions_per_week: ["weekly_sessions", "full_sessions"].includes(
            optionType,
          )
            ? sessions
            : null,
          member_amount: memberAmount,
          non_member_amount: nonMemberAmount,
          currency: "EUR",
        },
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "No se pudo guardar la opción");
      return;
    }
    setSuccess(`${previewName} guardado para ${selectedProgram}.`);
    setMemberAmount("");
    setNonMemberAmount("");
    setPeriodIds([]);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Opciones de inscripción</h3>
            <p className="mt-1 text-sm text-brand-black/55">
              Configura lo que podrá elegir el participante. WeMoot generará las
              reglas de precio automáticamente.
            </p>
          </div>
          <Button onClick={() => setOpen((value) => !value)}>
            <Plus className="size-4" />
            Nueva opción
          </Button>
        </div>

        {success && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-brand-cyan/10 p-3 text-sm">
            <CheckCircle2 className="size-4 text-brand-cyan" />
            {success}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl bg-brand-magenta/10 p-3 text-sm">
            {error}
          </p>
        )}

        {open && (
          <form
            onSubmit={saveOption}
            className="mt-5 space-y-5 rounded-2xl border bg-brand-black/[.02] p-4 sm:p-5"
          >
            <div>
              <Label>¿Cómo se puede contratar?</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {optionTypes.map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-xl border p-3 text-sm ${
                      optionType === option.value
                        ? "border-brand-cyan bg-brand-cyan/10"
                        : "bg-white"
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="option_type"
                      checked={optionType === option.value}
                      onChange={() => {
                        setOptionType(option.value);
                        setPeriodIds([]);
                      }}
                    />
                    <strong className="block">{option.title}</strong>
                    <span className="mt-1 block text-xs text-brand-black/55">
                      {option.description}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Modalidad</Label>
                <select
                  value={programId}
                  onChange={(event) => setProgramId(event.target.value)}
                  className="h-11 w-full rounded-xl border bg-white px-3"
                  required
                >
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
              </div>
              {["weekly_sessions", "full_sessions"].includes(optionType) && (
                <div>
                  <Label>Sesiones por semana</Label>
                  <select
                    value={sessions}
                    onChange={(event) =>
                      setSessions(Number(event.target.value))
                    }
                    className="h-11 w-full rounded-xl border bg-white px-3"
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value} {value === 1 ? "sesión" : "sesiones"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {optionType === "individual_periods" && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">
                  Semanas que tendrán este precio
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {periods.map((period) => (
                    <label
                      key={period.id}
                      className="flex items-start gap-2 rounded-xl border bg-white p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={periodIds.includes(period.id)}
                        onChange={(event) =>
                          setPeriodIds((current) =>
                            event.target.checked
                              ? [...current, period.id]
                              : current.filter((id) => id !== period.id),
                          )
                        }
                      />
                      <span>
                        <strong className="block">{period.label}</strong>
                        {formatDate(period.start_date)} –{" "}
                        {formatDate(period.end_date)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Precio socio (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={memberAmount}
                  onChange={(event) => setMemberAmount(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Precio no socio (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nonMemberAmount}
                  onChange={(event) => setNonMemberAmount(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="rounded-xl bg-brand-yellow/20 p-4 text-sm">
              <strong className="block">Vista previa</strong>
              <p className="mt-1">
                {selectedProgram} · {previewName}
              </p>
              <p className="mt-1">
                Socio: {formatCurrency(Number(memberAmount || 0))} · No socio:{" "}
                {formatCurrency(Number(nonMemberAmount || 0))}
              </p>
              {optionType === "full_event" && (
                <p className="mt-2 text-brand-black/60">
                  Seleccionará automáticamente los {periods.length} periodos; no
                  creará una modalidad ni un periodo adicional.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button disabled={busy || !programs.length}>
                {busy ? "Guardando…" : "Guardar opción"}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section>
        <h3 className="font-semibold">Opciones configuradas</h3>
        <p className="mt-1 text-sm text-brand-black/55">
          Revisa las combinaciones antes de publicar.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {summaries.map((summary) => (
            <article key={summary.key} className="rounded-xl border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-black/45">
                {summary.programName}
              </p>
              <strong className="mt-1 block">{summary.label}</strong>
              <span className="text-sm text-brand-black/55">
                {summary.periodLabel}
              </span>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <p>
                  <span className="block text-xs text-brand-black/45">
                    Socio
                  </span>
                  <strong>
                    {summary.memberAmount == null
                      ? "Falta"
                      : formatCurrency(summary.memberAmount)}
                  </strong>
                </p>
                <p>
                  <span className="block text-xs text-brand-black/45">
                    No socio
                  </span>
                  <strong>
                    {summary.nonMemberAmount == null
                      ? "Falta"
                      : formatCurrency(summary.nonMemberAmount)}
                  </strong>
                </p>
              </div>
              {(summary.memberAmount == null ||
                summary.nonMemberAmount == null ||
                summary.needsReview) && (
                <p className="mt-3 text-xs text-brand-magenta">
                  Revisa esta opción en la configuración avanzada.
                </p>
              )}
            </article>
          ))}
          {!summaries.length && (
            <p className="text-sm text-brand-black/50">
              Todavía no hay opciones configuradas.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

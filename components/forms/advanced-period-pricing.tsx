"use client";

import type { DraftProgram } from "@/components/forms/event-form";
import {
  generatePeriods,
  periodUnitLabel,
} from "@/lib/events/generate-periods";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function programTitle(program: DraftProgram) {
  const specialty =
    program.specialty === "custom"
      ? program.custom_specialty || "Nueva especialidad"
      : program.specialty;
  const turn =
    program.turn === "morning"
      ? "Mañana"
      : program.turn === "afternoon"
        ? "Tarde"
        : program.turn === "full_day"
          ? "Todo el día"
          : "Horario personalizado";
  return `${turn} · ${specialty}`;
}

export function AdvancedPeriodPricing({
  programs,
  updateProgram,
  updatePriceOverride,
  eventStart,
  eventEnd,
}: {
  programs: DraftProgram[];
  updateProgram: (
    clientId: string,
    field: keyof Omit<DraftProgram, "clientId">,
    value: string,
  ) => void;
  updatePriceOverride: (
    clientId: string,
    periodStartDate: string,
    values: Partial<DraftProgram["price_overrides"][string]>,
  ) => void;
  eventStart: string;
  eventEnd: string;
}) {
  return (
    <section>
      <div>
        <h2 className="font-semibold">Periodos y precios</h2>
        <p className="mt-1 text-sm text-brand-black/55">
          Cada modalidad puede tener una periodicidad, número de sesiones y
          precios diferentes. También puedes definir un periodo completo y
          dividirlo en semanas.
        </p>
      </div>

      <div className="mt-5 space-y-5">
        {programs.map((program) => {
          const startDate = program.period_start || eventStart;
          const endDate = program.period_end || eventEnd;
          const periods = generatePeriods(
            program.period_unit,
            startDate,
            endDate,
            Number(program.weekly_days),
          );
          const unit = periodUnitLabel(program.period_unit).toLocaleLowerCase(
            "es",
          );
          const sessions = Number(program.sessions_per_period);
          return (
            <article
              key={program.clientId}
              className="rounded-2xl border bg-brand-black/[.02] p-4 sm:p-5"
            >
              <div>
                <strong>{programTitle(program)}</strong>
                <p className="mt-1 text-xs text-brand-black/50">
                  Configura cómo podrá contratarse esta modalidad.
                </p>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ["daily", "Diario", "Cada día se selecciona por separado."],
                    ["weekly", "Semanal", "Bloques de 5, 6 o 7 días."],
                    ["monthly", "Mensual", "Un bloque por cada mes."],
                    [
                      "period_weekly",
                      "Periodo por semanas",
                      "Define un rango completo y divídelo en semanas.",
                    ],
                  ] as const
                ).map(([value, title, description]) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-xl border p-3 text-sm ${
                      program.period_unit === value
                        ? "border-brand-cyan bg-brand-cyan/10"
                        : "bg-white"
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name={`period-unit-${program.clientId}`}
                      checked={program.period_unit === value}
                      onChange={() =>
                        updateProgram(program.clientId, "period_unit", value)
                      }
                    />
                    <strong className="block">{title}</strong>
                    <span className="mt-1 block text-xs text-brand-black/55">
                      {description}
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(program.period_unit === "weekly" ||
                  program.period_unit === "period_weekly") && (
                  <div>
                    <Label>Días por bloque semanal</Label>
                    <select
                      value={program.weekly_days}
                      onChange={(event) =>
                        updateProgram(
                          program.clientId,
                          "weekly_days",
                          event.target.value,
                        )
                      }
                      className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                    >
                      <option value="5">5 días · laborables</option>
                      <option value="6">6 días · incluye sábado</option>
                      <option value="7">7 días · semana completa</option>
                    </select>
                  </div>
                )}
                <div>
                  <Label>Sesiones por {unit}</Label>
                  <select
                    value={program.sessions_per_period}
                    onChange={(event) =>
                      updateProgram(
                        program.clientId,
                        "sessions_per_period",
                        event.target.value,
                      )
                    }
                    className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                  >
                    {Array.from({ length: 20 }, (_, index) => index + 1).map(
                      (value) => (
                        <option key={value} value={value}>
                          {value} {value === 1 ? "sesión" : "sesiones"}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div>
                  <Label>Fecha inicial *</Label>
                  <Input
                    type="date"
                    value={startDate}
                    min={eventStart || undefined}
                    max={eventEnd || undefined}
                    onChange={(event) =>
                      updateProgram(
                        program.clientId,
                        "period_start",
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>
                <div>
                  <Label>Fecha final *</Label>
                  <Input
                    type="date"
                    value={endDate}
                    min={eventStart || undefined}
                    max={eventEnd || undefined}
                    onChange={(event) =>
                      updateProgram(
                        program.clientId,
                        "period_end",
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>
              </div>

              {program.period_unit === "period_weekly" && (
                <div className="mt-4 rounded-xl border border-brand-cyan/30 bg-brand-cyan/[.07] p-3 text-sm">
                  <strong>Periodo completo</strong>
                  <p className="mt-1 text-brand-black/60">
                    Indica la fecha inicial y final del periodo. Crearemos
                    automáticamente semanas de {program.weekly_days} días dentro
                    de ese rango; el último bloque se ajustará a la fecha final.
                  </p>
                </div>
              )}

              <div className="mt-4 rounded-xl border bg-white p-4">
                <strong className="text-sm">
                  Vista previa · {periods.length}{" "}
                  {periods.length === 1 ? "periodo" : "periodos"}
                </strong>
                <div className="mt-3 flex flex-wrap gap-2">
                  {periods.slice(0, 12).map((period) => (
                    <span
                      key={period.start_date}
                      className="rounded-lg bg-brand-black/[.05] px-3 py-2 text-xs"
                    >
                      <strong>{period.label}</strong> · {period.start_date}
                      {period.end_date !== period.start_date
                        ? ` – ${period.end_date}`
                        : ""}{" "}
                      · {sessions} {sessions === 1 ? "sesión" : "sesiones"}
                    </span>
                  ))}
                  {periods.length > 12 && (
                    <span className="px-2 py-2 text-xs text-brand-black/55">
                      y {periods.length - 12} más…
                    </span>
                  )}
                  {!periods.length && (
                    <span className="text-sm text-brand-magenta">
                      Indica un rango de fechas válido.
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label>Socio por {unit} (€) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={program.member_amount}
                    onChange={(event) =>
                      updateProgram(
                        program.clientId,
                        "member_amount",
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>
                <div>
                  <Label>No socio por {unit} (€) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={program.non_member_amount}
                    onChange={(event) =>
                      updateProgram(
                        program.clientId,
                        "non_member_amount",
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>
                <div>
                  <Label>Socio evento completo (€)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={program.full_member_amount}
                    onChange={(event) =>
                      updateProgram(
                        program.clientId,
                        "full_member_amount",
                        event.target.value,
                      )
                    }
                  />
                </div>
                <div>
                  <Label>No socio evento completo (€)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={program.full_non_member_amount}
                    onChange={(event) =>
                      updateProgram(
                        program.clientId,
                        "full_non_member_amount",
                        event.target.value,
                      )
                    }
                  />
                </div>
              </div>

              {!!periods.length && (
                <details className="mt-4 rounded-xl border bg-white">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                    Precios especiales o descuentos por periodo
                  </summary>
                  <div className="space-y-3 border-t p-4">
                    <p className="text-xs text-brand-black/55">
                      Activa únicamente los días, semanas o meses cuyo precio
                      sea diferente al precio base.
                    </p>
                    {periods.map((period) => {
                      const override =
                        program.price_overrides[period.start_date];
                      return (
                        <div
                          key={period.start_date}
                          className="grid gap-3 rounded-xl bg-brand-black/[.03] p-3 sm:grid-cols-[1fr_10rem_10rem]"
                        >
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={override?.enabled ?? false}
                              onChange={(event) =>
                                updatePriceOverride(
                                  program.clientId,
                                  period.start_date,
                                  { enabled: event.target.checked },
                                )
                              }
                            />
                            <span>
                              <strong className="block">{period.label}</strong>
                              {period.start_date}
                              {period.end_date !== period.start_date
                                ? ` – ${period.end_date}`
                                : ""}
                            </span>
                          </label>
                          {override?.enabled && (
                            <>
                              <div>
                                <Label>Socio (€)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={override.member_amount}
                                  onChange={(event) =>
                                    updatePriceOverride(
                                      program.clientId,
                                      period.start_date,
                                      { member_amount: event.target.value },
                                    )
                                  }
                                  required
                                />
                              </div>
                              <div>
                                <Label>No socio (€)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={override.non_member_amount}
                                  onChange={(event) =>
                                    updatePriceOverride(
                                      program.clientId,
                                      period.start_date,
                                      {
                                        non_member_amount: event.target.value,
                                      },
                                    )
                                  }
                                  required
                                />
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

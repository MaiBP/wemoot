"use client";

import type {
  EventPeriod,
  EventPriceRule,
  EventProgramPeriod,
} from "@/types/event";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  getSelectablePriceRules,
  getSelectablePriceScope,
  hasIndividualPriceRules,
} from "@/lib/pricing/package-options";

export function PeriodSelector({
  periods,
  relations,
  priceRules,
  participantType,
  programId,
  values,
  selectedPriceRuleId,
  onChange,
  onPriceRuleChange,
  showCapacity = true,
  allowIndividualPeriods = true,
}: {
  periods: EventPeriod[];
  relations: EventProgramPeriod[];
  priceRules: EventPriceRule[];
  participantType: string;
  programId: string;
  values: string[];
  selectedPriceRuleId?: string;
  onChange: (values: string[]) => void;
  onPriceRuleChange: (ruleId?: string) => void;
  showCapacity?: boolean;
  allowIndividualPeriods?: boolean;
}) {
  const available = periods.filter((period) =>
    relations.some(
      (relation) =>
        relation.program_id === programId &&
        relation.period_id === period.id &&
        relation.is_available,
    ),
  );
  const availableIds = available.map((period) => period.id);
  const selectableRules = getSelectablePriceRules(
    priceRules,
    programId,
    participantType,
  ).filter(
    (rule) =>
      allowIndividualPeriods ||
      getSelectablePriceScope(rule) === "full_event",
  );
  const individualPrices =
    allowIndividualPeriods &&
    hasIndividualPriceRules(priceRules, programId, participantType);
  const selectedRule = selectableRules.find(
    (rule) => rule.id === selectedPriceRuleId,
  );
  const selectedScope = selectedRule
    ? getSelectablePriceScope(selectedRule)
    : null;
  const packageRequired = selectableRules.length > 0 && !individualPrices;
  const implicitFullEvent =
    !allowIndividualPeriods && selectableRules.length === 0;
  const allPeriodsSelected =
    availableIds.length > 0 &&
    availableIds.every((periodId) => values.includes(periodId));

  function chooseRule(rule?: EventPriceRule) {
    const scope = rule ? getSelectablePriceScope(rule) : null;
    onPriceRuleChange(rule?.id);
    if (scope === "full_event") onChange(availableIds);
    else if (selectedScope === "full_event") onChange([]);
  }

  return (
    <div className="space-y-4">
      {(selectableRules.length > 0 ||
        individualPrices ||
        implicitFullEvent) && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Tarifa</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {individualPrices && (
              <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
                <input
                  type="radio"
                  name={`price-rule-${programId}`}
                  checked={!selectedPriceRuleId}
                  onChange={() => chooseRule()}
                />
                <span>
                  <strong className="block">Semanas sueltas</strong>
                  Elige una o varias semanas.
                </span>
              </label>
            )}
            {implicitFullEvent && (
              <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={allPeriodsSelected}
                  onChange={(event) =>
                    onChange(event.target.checked ? availableIds : [])
                  }
                />
                <span>
                  <strong className="block">Campus completo</strong>
                  Incluye todos los periodos disponibles.
                </span>
              </label>
            )}
            {selectableRules.map((rule) => {
              const scope = getSelectablePriceScope(rule);
              return (
                <label
                  key={rule.id}
                  className="flex items-start gap-2 rounded-xl border p-3 text-sm"
                >
                  <input
                    type="radio"
                    name={`price-rule-${programId}`}
                    checked={selectedPriceRuleId === rule.id}
                    onChange={() => chooseRule(rule)}
                  />
                  <span>
                    <strong className="block">
                      {rule.label ||
                        (scope === "full_event"
                          ? "Campus completo"
                          : "Pack semanal")}
                    </strong>
                    {formatCurrency(Number(rule.amount))}
                    {scope === "per_week" ? " por semana" : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          {selectedScope === "per_week"
            ? "Semanas para este pack"
            : "Semanas o periodos"}
        </legend>
        {selectedScope === "full_event" && (
          <p className="mb-3 rounded-xl bg-brand-cyan/10 p-3 text-sm">
            Campus completo seleccionado. Incluye todos los periodos y bloquea
            la selección individual.
          </p>
        )}
        {packageRequired && !selectedRule && (
          <p className="mb-3 rounded-xl bg-brand-yellow/25 p-3 text-sm">
            Elige primero uno de los packs disponibles.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {available.map((period) => {
            const relation = relations.find(
              (item) =>
                item.program_id === programId &&
                item.period_id === period.id,
            )!;
            const remaining =
              relation.capacity == null
                ? null
                : Math.max(
                    0,
                    relation.capacity -
                      relation.registered_count -
                      (relation.reserved_count ?? 0),
                  );
            const disabled =
              selectedScope === "full_event" ||
              implicitFullEvent ||
              (packageRequired && !selectedRule) ||
              (showCapacity && remaining === 0);
            return (
              <label
                key={period.id}
                className="flex items-start gap-2 rounded-xl border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={values.includes(period.id)}
                  disabled={disabled}
                  onChange={(event) => {
                    if (selectedScope === "full_event") return;
                    onChange(
                      event.target.checked
                        ? [...values, period.id]
                        : values.filter((id) => id !== period.id),
                    );
                  }}
                />
                <span>
                  <strong className="block">{period.label}</strong>
                  {formatDate(period.start_date)}
                  {period.end_date !== period.start_date
                    ? ` – ${formatDate(period.end_date)}`
                    : ""}{" "}
                  ·{" "}
                  {!showCapacity
                    ? "Preinscripción"
                    : remaining == null
                      ? "Disponible"
                      : `${remaining} plazas`}
                </span>
              </label>
            );
          })}
        </div>
        {!available.length && (
          <p className="text-sm text-brand-magenta">
            No hay periodos disponibles para esta modalidad.
          </p>
        )}
      </fieldset>
    </div>
  );
}

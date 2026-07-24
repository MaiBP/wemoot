"use client";
import type { EventPeriod, EventProgramPeriod } from "@/types/event";
export function PeriodSelector({
  periods,
  relations,
  programId,
  values,
  onChange,
  showCapacity = true,
  allowIndividualPeriods = true,
}: {
  periods: EventPeriod[];
  relations: EventProgramPeriod[];
  programId: string;
  values: string[];
  onChange: (values: string[]) => void;
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
  if (!allowIndividualPeriods) {
    const availableIds = available.map((period) => period.id);
    const allSelected =
      availableIds.length > 0 &&
      availableIds.every((periodId) => values.includes(periodId));
    const hasUnavailablePeriod =
      showCapacity &&
      available.some((period) => {
        const relation = relations.find(
          (item) =>
            item.program_id === programId && item.period_id === period.id,
        );
        if (!relation || relation.capacity == null) return false;
        return (
          relation.capacity -
            relation.registered_count -
            (relation.reserved_count ?? 0) <=
          0
        );
      });
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Periodo</legend>
        <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={!availableIds.length || hasUnavailablePeriod}
            onChange={(event) => onChange(event.target.checked ? availableIds : [])}
          />
          <span>
            <strong className="block">Campus completo</strong>
            Incluye todos los periodos disponibles.
          </span>
        </label>
      </fieldset>
    );
  }
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Semanas o periodos</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {available.map((period) => {
          const relation = relations.find(
            (item) =>
              item.program_id === programId && item.period_id === period.id,
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
          return (
            <label
              key={period.id}
              className="flex items-start gap-2 rounded-xl border p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={values.includes(period.id)}
                disabled={showCapacity && remaining === 0}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...values, period.id]
                      : values.filter((id) => id !== period.id),
                  )
                }
              />
              <span>
                <strong className="block">{period.label}</strong>
                {period.start_date}–{period.end_date} ·{" "}
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
  );
}

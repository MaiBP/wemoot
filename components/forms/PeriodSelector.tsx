"use client";
import type { EventPeriod, EventProgramPeriod } from "@/types/event";
export function PeriodSelector({
  periods,
  relations,
  programId,
  values,
  onChange,
}: {
  periods: EventPeriod[];
  relations: EventProgramPeriod[];
  programId: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const available = periods.filter((period) =>
    relations.some(
      (relation) =>
        relation.program_id === programId &&
        relation.period_id === period.id &&
        relation.is_available,
    ),
  );
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
                disabled={remaining === 0}
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
                {remaining == null ? "Disponible" : `${remaining} plazas`}
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

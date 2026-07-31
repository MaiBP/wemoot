export type PeriodUnit = "daily" | "weekly" | "monthly" | "period_weekly";

export interface GeneratedPeriod {
  label: string;
  start_date: string;
  end_date: string;
}

const DAY_MS = 86_400_000;

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function monthLabel(value: Date) {
  const formatted = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function generatePeriods(
  unit: PeriodUnit,
  startDate: string,
  endDate: string,
  weeklyDays = 7,
): GeneratedPeriod[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const periods: GeneratedPeriod[] = [];

  if (unit === "daily") {
    for (let current = start; current <= end; current = addDays(current, 1)) {
      const date = isoDate(current);
      periods.push({
        label: new Intl.DateTimeFormat("es-ES", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        }).format(current),
        start_date: date,
        end_date: date,
      });
    }
    return periods;
  }

  if (unit === "weekly" || unit === "period_weekly") {
    let current = start;
    let index = 1;
    while (current <= end) {
      const periodEnd = new Date(
        Math.min(
          addDays(current, Math.min(7, Math.max(5, weeklyDays)) - 1).getTime(),
          end.getTime(),
        ),
      );
      periods.push({
        label: `Semana ${index}`,
        start_date: isoDate(current),
        end_date: isoDate(periodEnd),
      });
      current = addDays(current, 7);
      index += 1;
    }
    return periods;
  }

  let current = start;
  while (current <= end) {
    const lastOfMonth = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0),
    );
    const periodEnd = new Date(Math.min(lastOfMonth.getTime(), end.getTime()));
    periods.push({
      label: monthLabel(current),
      start_date: isoDate(current),
      end_date: isoDate(periodEnd),
    });
    current = addDays(periodEnd, 1);
  }
  return periods;
}

export function periodUnitLabel(unit: PeriodUnit) {
  if (unit === "daily") return "Día";
  if (unit === "weekly" || unit === "period_weekly") return "Semana";
  return "Mes";
}

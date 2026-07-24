export interface PeriodDateRange {
  start_date: string;
  end_date: string;
}

const spanishMonths = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function formatPeriodDateRange(period: PeriodDateRange) {
  const parse = (value: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match
      ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
      : null;
  };
  const start = parse(period.start_date);
  const end = parse(period.end_date);
  if (
    !start ||
    !end ||
    start.month < 1 ||
    start.month > 12 ||
    end.month < 1 ||
    end.month > 12
  )
    return null;
  if (start.year === end.year && start.month === end.month)
    return `Periodo del ${start.day} al ${end.day} de ${spanishMonths[start.month - 1]}`;
  if (start.year === end.year)
    return `Periodo del ${start.day} de ${spanishMonths[start.month - 1]} al ${end.day} de ${spanishMonths[end.month - 1]}`;
  return `Periodo del ${start.day} de ${spanishMonths[start.month - 1]} de ${start.year} al ${end.day} de ${spanishMonths[end.month - 1]} de ${end.year}`;
}

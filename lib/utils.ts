import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null, locale = "es-ES") {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value ?? 0);
}

export function formatDate(value: string, locale = "es-ES") {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}


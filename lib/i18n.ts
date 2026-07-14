export const dictionaries = {
  es: { dashboard: "Resumen", events: "Eventos", participants: "Inscritos", newEvent: "Nuevo evento", logout: "Cerrar sesión" },
  en: { dashboard: "Overview", events: "Events", participants: "Participants", newEvent: "New event", logout: "Log out" },
} as const;

export type Locale = keyof typeof dictionaries;
export const getDictionary = (locale: string | null | undefined) => dictionaries[locale === "en" ? "en" : "es"];


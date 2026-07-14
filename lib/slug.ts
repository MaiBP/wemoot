export function createSlug(value: string) {
  const base = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "evento"}-${crypto.randomUUID().slice(0, 8)}`;
}


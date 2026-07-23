"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
export function EventForm({
  defaults,
  locations,
}: {
  defaults: Record<string, string>;
  locations: Array<{
    id: string;
    name: string;
    city?: string | null;
    address_line_1?: string | null;
  }>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(formData: FormData) {
    setLoading(true);
    setError("");
    const payload = Object.fromEntries(formData);
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "No se pudo crear el evento");
      setLoading(false);
      return;
    }
    router.push(`/dashboard/events/${result.event.id}`);
    router.refresh();
  }
  return (
    <form action={submit} className="space-y-7">
      <section>
        <h2 className="mb-4 font-semibold">Información principal</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="title">Nombre del evento *</Label>
            <Input
              id="title"
              name="title"
              required
              placeholder="Campus de Tecnificación Barcelona"
            />
          </div>
          <div>
            <Label htmlFor="event_type">Tipo *</Label>
            <Input
              id="event_type"
              name="event_type"
              required
              placeholder="Campus, torneo, clínica…"
            />
          </div>
          <div>
            <Label htmlFor="city">Ciudad *</Label>
            <Input
              id="city"
              name="city"
              required
              defaultValue={defaults.city}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" name="description" />
          </div>
        </div>
      </section>
      <section>
        <h2 className="mb-4 font-semibold">Fecha y ubicación</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="start_date">Fecha de inicio *</Label>
            <Input id="start_date" name="start_date" type="date" required />
          </div>
          <div>
            <Label htmlFor="end_date">Fecha final *</Label>
            <Input id="end_date" name="end_date" type="date" required />
          </div>
          <div>
            <Label htmlFor="location">Ubicación exacta</Label>
            <Input
              id="location"
              name="location"
              defaultValue={defaults.location}
            />
          </div>
          {locations.length > 0 && (
            <div>
              <Label htmlFor="location_id">Ubicación guardada</Label>
              <select
                id="location_id"
                name="location_id"
                defaultValue={defaults.location_id}
                className="h-10 w-full rounded-xl border border-brand-black/15 bg-white px-3 text-sm"
              >
                <option value="">Usar sólo el texto indicado</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                    {location.city ? ` · ${location.city}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor="schedule">Horario</Label>
            <Input
              id="schedule"
              name="schedule"
              placeholder="De 9:00 a 13:00"
            />
          </div>
        </div>
      </section>
      <section>
        <h2 className="mb-4 font-semibold">Contacto del evento</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="contact_email">Email</Label>
            <Input
              id="contact_email"
              name="contact_email"
              type="email"
              defaultValue={defaults.contact_email}
            />
          </div>
          <div>
            <Label htmlFor="contact_phone">Teléfono</Label>
            <Input
              id="contact_phone"
              name="contact_phone"
              defaultValue={defaults.contact_phone}
            />
          </div>
        </div>
      </section>
      <section>
        <h2 className="mb-4 font-semibold">Participación</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="age_range">Edades</Label>
            <Input id="age_range" name="age_range" placeholder="10-14" />
          </div>
          <div>
            <Label htmlFor="price">Precio (€) *</Label>
            <Input
              id="price"
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
            />
          </div>
          <div>
            <Label htmlFor="capacity">Plazas *</Label>
            <Input
              id="capacity"
              name="capacity"
              type="number"
              min="1"
              required
            />
          </div>
        </div>
      </section>
      {error && (
        <p className="rounded-xl border-l-4 border-brand-magenta bg-brand-magenta/10 p-3 text-sm text-brand-black">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button disabled={loading}>
          {loading ? "Creando…" : "Crear borrador"}
        </Button>
      </div>
    </form>
  );
}

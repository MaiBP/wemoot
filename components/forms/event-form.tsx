"use client";

import { useState } from "react";
import { CalendarRange, Layers3, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generatePeriods } from "@/lib/events/generate-periods";
import { AdvancedPeriodPricing } from "@/components/forms/advanced-period-pricing";

type EventMode = "simple" | "advanced";

export interface DraftProgram {
  clientId: string;
  specialty: string;
  custom_specialty: string;
  turn: "morning" | "afternoon" | "full_day" | "custom";
  start_time: string;
  end_time: string;
  min_age: string;
  max_age: string;
  capacity: string;
  member_amount: string;
  non_member_amount: string;
  full_member_amount: string;
  full_non_member_amount: string;
  period_unit: "daily" | "weekly" | "monthly" | "period_weekly";
  weekly_days: string;
  sessions_per_period: string;
  period_start: string;
  period_end: string;
  price_overrides: Record<
    string,
    {
      enabled: boolean;
      member_amount: string;
      non_member_amount: string;
    }
  >;
}

interface DraftPeriod {
  clientId: string;
  label: string;
  start_date: string;
  end_date: string;
}

const newProgram = (): DraftProgram => ({
  clientId: crypto.randomUUID(),
  specialty: "Perfeccionamiento",
  custom_specialty: "",
  turn: "morning",
  start_time: "",
  end_time: "",
  min_age: "",
  max_age: "",
  capacity: "",
  member_amount: "",
  non_member_amount: "",
  full_member_amount: "",
  full_non_member_amount: "",
  period_unit: "weekly",
  weekly_days: "5",
  sessions_per_period: "1",
  period_start: "",
  period_end: "",
  price_overrides: {},
});

const newPeriod = (): DraftPeriod => ({
  clientId: crypto.randomUUID(),
  label: "",
  start_date: "",
  end_date: "",
});

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
  const [mode, setMode] = useState<EventMode>("simple");
  const [programs, setPrograms] = useState<DraftProgram[]>([newProgram()]);
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateProgram(
    clientId: string,
    field: keyof Omit<DraftProgram, "clientId">,
    value: string,
  ) {
    setPrograms((current) =>
      current.map((program) =>
        program.clientId === clientId
          ? { ...program, [field]: value }
          : program,
      ),
    );
  }

  function updatePriceOverride(
    clientId: string,
    periodStartDate: string,
    values: Partial<DraftProgram["price_overrides"][string]>,
  ) {
    setPrograms((current) =>
      current.map((program) =>
        program.clientId === clientId
          ? {
              ...program,
              price_overrides: {
                ...program.price_overrides,
                [periodStartDate]: {
                  enabled:
                    values.enabled ??
                    program.price_overrides[periodStartDate]?.enabled ??
                    false,
                  member_amount:
                    values.member_amount ??
                    program.price_overrides[periodStartDate]?.member_amount ??
                    "",
                  non_member_amount:
                    values.non_member_amount ??
                    program.price_overrides[periodStartDate]
                      ?.non_member_amount ??
                    "",
                },
              },
            }
          : program,
      ),
    );
  }

  async function submit(formData: FormData) {
    setLoading(true);
    setError("");
    const raw = Object.fromEntries(formData);
    const payload: Record<string, unknown> = {
      ...raw,
      event_mode: mode,
    };
    for (const key of [
      "description",
      "location",
      "location_id",
      "contact_email",
      "contact_phone",
      "schedule",
      "age_range",
    ]) {
      if (!payload[key]) payload[key] = null;
    }
    if (mode === "advanced") {
      payload.price = null;
      payload.capacity = null;
      payload.programs = programs.map((program) => {
        const specialty =
          program.specialty === "custom"
            ? program.custom_specialty.trim()
            : program.specialty;
        const turn =
          program.turn === "morning"
            ? "Mañana"
            : program.turn === "afternoon"
              ? "Tarde"
              : program.turn === "full_day"
                ? "Todo el día"
                : "Horario personalizado";
        return {
          name: `${specialty} · ${turn}`,
          category: specialty,
          turn: program.turn,
          start_time: program.start_time || null,
          end_time: program.end_time || null,
          min_age: program.min_age || null,
          max_age: program.max_age || null,
          capacity: program.capacity,
          included_items: [],
        };
      });
      payload.periods = [];
      payload.initial_prices = [];
      payload.program_setups = programs.map((program, programIndex) => {
        const startDate = program.period_start || eventStart;
        const endDate = program.period_end || eventEnd;
        const periodStarts = new Set(
          generatePeriods(
            program.period_unit,
            startDate,
            endDate,
            Number(program.weekly_days),
          ).map((period) => period.start_date),
        );
        return {
          program_index: programIndex,
          period_unit: program.period_unit,
          weekly_days: program.weekly_days,
          sessions_per_period: program.sessions_per_period,
          start_date: startDate,
          end_date: endDate,
          member_amount: program.member_amount,
          non_member_amount: program.non_member_amount,
          full_member_amount: program.full_member_amount || null,
          full_non_member_amount: program.full_non_member_amount || null,
          overrides: Object.entries(program.price_overrides).flatMap(
            ([periodStartDate, override]) =>
              override.enabled && periodStarts.has(periodStartDate)
                ? [
                    {
                      period_start_date: periodStartDate,
                      member_amount: override.member_amount,
                      non_member_amount: override.non_member_amount,
                    },
                  ]
                : [],
          ),
        };
      });
    } else {
      payload.programs = [];
      payload.periods = [];
      payload.initial_prices = [];
      payload.program_setups = [];
    }
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
    <form action={submit} className="space-y-8">
      <section>
        <h2 className="font-semibold">¿Qué tipo de evento vas a crear?</h2>
        <p className="mt-1 text-sm text-brand-black/55">
          Podrás editar toda la información mientras continúe como borrador.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ModeCard
            active={mode === "simple"}
            icon={<CalendarRange className="size-5" />}
            title="Evento básico"
            description="Una actividad, un precio y un único aforo general."
            onClick={() => setMode("simple")}
          />
          <ModeCard
            active={mode === "advanced"}
            icon={<Layers3 className="size-5" />}
            title="Evento avanzado"
            description="Varias modalidades, periodos, aforos y opciones de precio."
            onClick={() => setMode("advanced")}
          />
        </div>
      </section>

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
            <Input
              id="start_date"
              name="start_date"
              type="date"
              value={eventStart}
              onChange={(event) => {
                setEventStart(event.target.value);
              }}
              required
            />
          </div>
          <div>
            <Label htmlFor="end_date">Fecha final *</Label>
            <Input
              id="end_date"
              name="end_date"
              type="date"
              value={eventEnd}
              onChange={(event) => {
                setEventEnd(event.target.value);
              }}
              required
            />
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
            <Label htmlFor="schedule">Horario general</Label>
            <Input
              id="schedule"
              name="schedule"
              placeholder="De 9:00 a 13:00"
            />
          </div>
          <div>
            <Label htmlFor="age_range">Edades</Label>
            <Input id="age_range" name="age_range" placeholder="10-14" />
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

      {mode === "simple" ? (
        <section>
          <h2 className="mb-4 font-semibold">Participación</h2>
          <div className="grid gap-4 md:grid-cols-2">
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
      ) : (
        <>
          <AdvancedPrograms
            programs={programs}
            setPrograms={setPrograms}
            updateProgram={updateProgram}
          />
          <AdvancedPeriodPricing
            programs={programs}
            updateProgram={updateProgram}
            updatePriceOverride={updatePriceOverride}
            eventStart={eventStart}
            eventEnd={eventEnd}
          />
          <section className="rounded-2xl border border-brand-cyan/30 bg-brand-cyan/10 p-4 text-sm">
            <strong className="block">
              El evento se guardará como borrador
            </strong>
            <p className="mt-1 text-brand-black/65">
              Después podrás configurar precios, descuentos, preinscripción,
              disponibilidad por periodo y el formulario público antes de
              publicarlo.
            </p>
          </section>
        </>
      )}

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
          {loading
            ? "Creando…"
            : mode === "advanced"
              ? "Crear borrador avanzado"
              : "Crear borrador"}
        </Button>
      </div>
    </form>
  );
}

function ModeCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        active
          ? "border-brand-cyan bg-brand-cyan/10 ring-1 ring-brand-cyan"
          : "border-brand-black/10 bg-white hover:border-brand-cyan/50"
      }`}
    >
      <span className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </span>
      <span className="mt-2 block text-sm text-brand-black/55">
        {description}
      </span>
    </button>
  );
}

function AdvancedPrograms({
  programs,
  setPrograms,
  updateProgram,
}: {
  programs: DraftProgram[];
  setPrograms: React.Dispatch<React.SetStateAction<DraftProgram[]>>;
  updateProgram: (
    clientId: string,
    field: keyof Omit<DraftProgram, "clientId">,
    value: string,
  ) => void;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Modalidades</h2>
          <p className="mt-1 text-sm text-brand-black/55">
            Combina un turno con una especialidad, horario, edades y plazas.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setPrograms((current) => [...current, newProgram()])}
        >
          <Plus className="size-4" /> Añadir modalidad
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {programs.map((program, index) => (
          <div
            key={program.clientId}
            className="grid gap-3 rounded-2xl border bg-brand-black/[.02] p-4 md:grid-cols-12"
          >
            <div className="md:col-span-3">
              <Label>Turno *</Label>
              <select
                value={program.turn}
                onChange={(event) =>
                  updateProgram(program.clientId, "turn", event.target.value)
                }
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="morning">Mañana</option>
                <option value="afternoon">Tarde</option>
                <option value="full_day">Todo el día</option>
                <option value="custom">Horario personalizado</option>
              </select>
            </div>
            <div className="md:col-span-4">
              <Label>Especialidad *</Label>
              <select
                value={program.specialty}
                onChange={(event) =>
                  updateProgram(
                    program.clientId,
                    "specialty",
                    event.target.value,
                  )
                }
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="Perfeccionamiento">Perfeccionamiento</option>
                <option value="Tecnificación">Tecnificación</option>
                <option value="Pruebas">Pruebas</option>
                <option value="Élite Pro">Élite Pro</option>
                <option value="Preparación física">Preparación física</option>
                <option value="Porteros">Porteros</option>
                <option value="custom">Crear opción…</option>
              </select>
            </div>
            {program.specialty === "custom" && (
              <div className="md:col-span-3">
                <Label>Nueva especialidad *</Label>
                <Input
                  value={program.custom_specialty}
                  onChange={(event) =>
                    updateProgram(
                      program.clientId,
                      "custom_specialty",
                      event.target.value,
                    )
                  }
                  required
                />
              </div>
            )}
            <div className="md:col-span-2">
              <Label>Plazas *</Label>
              <Input
                type="number"
                min="1"
                value={program.capacity}
                onChange={(event) =>
                  updateProgram(
                    program.clientId,
                    "capacity",
                    event.target.value,
                  )
                }
                required
              />
            </div>
            <div className="flex items-end justify-end md:col-span-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Eliminar modalidad ${index + 1}`}
                disabled={programs.length === 1}
                onClick={() =>
                  setPrograms((current) =>
                    current.filter(
                      (item) => item.clientId !== program.clientId,
                    ),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="md:col-span-3">
              <Label>Inicio</Label>
              <Input
                type="time"
                value={program.start_time}
                onChange={(event) =>
                  updateProgram(
                    program.clientId,
                    "start_time",
                    event.target.value,
                  )
                }
              />
            </div>
            <div className="md:col-span-3">
              <Label>Final</Label>
              <Input
                type="time"
                value={program.end_time}
                onChange={(event) =>
                  updateProgram(
                    program.clientId,
                    "end_time",
                    event.target.value,
                  )
                }
              />
            </div>
            <div className="md:col-span-3">
              <Label>Edad mínima</Label>
              <Input
                type="number"
                min="3"
                max="100"
                value={program.min_age}
                onChange={(event) =>
                  updateProgram(program.clientId, "min_age", event.target.value)
                }
                placeholder="6"
              />
            </div>
            <div className="md:col-span-3">
              <Label>Edad máxima</Label>
              <Input
                type="number"
                min="3"
                max="100"
                value={program.max_age}
                onChange={(event) =>
                  updateProgram(program.clientId, "max_age", event.target.value)
                }
                placeholder="14"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AdvancedPeriods({
  periods,
  setPeriods,
  updatePeriod,
}: {
  periods: DraftPeriod[];
  setPeriods: React.Dispatch<React.SetStateAction<DraftPeriod[]>>;
  updatePeriod: (
    clientId: string,
    field: keyof Omit<DraftPeriod, "clientId">,
    value: string,
  ) => void;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Periodos iniciales</h2>
          <p className="mt-1 text-sm text-brand-black/55">
            Crea semanas, jornadas o bloques que podrá seleccionar el
            participante.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setPeriods((current) => [...current, newPeriod()])}
        >
          <Plus className="size-4" /> Añadir periodo
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {periods.map((period, index) => (
          <div
            key={period.clientId}
            className="grid gap-3 rounded-2xl border bg-brand-black/[.02] p-4 md:grid-cols-12"
          >
            <div className="md:col-span-5">
              <Label>Nombre *</Label>
              <Input
                value={period.label}
                onChange={(event) =>
                  updatePeriod(period.clientId, "label", event.target.value)
                }
                placeholder="Semana 1"
                required
              />
            </div>
            <div className="md:col-span-3">
              <Label>Inicio *</Label>
              <Input
                type="date"
                value={period.start_date}
                onChange={(event) =>
                  updatePeriod(
                    period.clientId,
                    "start_date",
                    event.target.value,
                  )
                }
                required
              />
            </div>
            <div className="md:col-span-3">
              <Label>Final *</Label>
              <Input
                type="date"
                value={period.end_date}
                onChange={(event) =>
                  updatePeriod(period.clientId, "end_date", event.target.value)
                }
                required
              />
            </div>
            <div className="flex items-end justify-end md:col-span-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Eliminar periodo ${index + 1}`}
                disabled={periods.length === 1}
                onClick={() =>
                  setPeriods((current) =>
                    current.filter((item) => item.clientId !== period.clientId),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

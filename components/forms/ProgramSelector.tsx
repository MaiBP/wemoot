"use client";
import type { EventProgram } from "@/types/event";
import { Label } from "@/components/ui/label";
export function ProgramSelector({
  programs,
  value,
  onChange,
}: {
  programs: EventProgram[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label htmlFor="dynamic-program">Modalidad</Label>
      <select
        id="dynamic-program"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border bg-white px-3"
        required
      >
        <option value="" disabled>
          Selecciona una modalidad
        </option>
        {programs.map((program) => (
          <option key={program.id} value={program.id}>
            {program.name} · {program.capacity} plazas
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";

import type { EventProgram } from "@/types/event";

export function ProgramSelector({
  programs,
  values,
  onChange,
  allowMultiple,
}: {
  programs: EventProgram[];
  values: string[];
  onChange: (values: string[]) => void;
  allowMultiple: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-brand-black/75">
        Modalidades
      </legend>
      <p className="mb-3 text-sm text-brand-black/55">
        {allowMultiple
          ? "Puedes elegir una o varias modalidades."
          : "Elige una modalidad."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {programs.map((program) => (
          <label
            key={program.id}
            className="flex items-start gap-3 rounded-xl border p-3 text-sm"
          >
            <input
              type={allowMultiple ? "checkbox" : "radio"}
              name={allowMultiple ? undefined : "program"}
              checked={values.includes(program.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? allowMultiple
                      ? [...values, program.id]
                      : [program.id]
                    : values.filter((id) => id !== program.id),
                )
              }
            />
            <span>
              <strong className="block">{program.name}</strong>
              {program.capacity} plazas
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

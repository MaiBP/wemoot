"use client";
import type {
  RegistrationFormField,
  RegistrationFormSection,
} from "@/types/event";
import { FormFieldEditor } from "@/components/forms/FormFieldEditor";
import { Input } from "@/components/ui/input";

export function FormSectionEditor({
  section,
  fields,
  update,
  remove,
}: {
  section: RegistrationFormSection;
  fields: RegistrationFormField[];
  update: (
    entity: "section" | "field",
    id: string,
    changes: Record<string, unknown>,
  ) => void;
  remove: (entity: "section" | "field", id: string) => void;
}) {
  return (
    <section className="rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <Input
            defaultValue={section.title}
            aria-label="Título de sección"
            onBlur={(event) =>
              event.target.value !== section.title &&
              update("section", section.id, { title: event.target.value })
            }
          />
          <p className="text-xs text-brand-black/45">{section.section_key}</p>
        </div>
        <label className="text-sm">
          <input
            type="checkbox"
            checked={section.is_active}
            onChange={(event) =>
              update("section", section.id, { is_active: event.target.checked })
            }
          />{" "}
          Activa
        </label>
      </div>
      <div className="space-y-2">
        {fields.map((field) => (
          <FormFieldEditor
            key={field.id}
            field={field}
            onChange={(changes) => update("field", field.id, changes)}
            onDelete={() => remove("field", field.id)}
          />
        ))}
        {!fields.length && (
          <p className="text-sm text-brand-black/45">
            Sección dinámica sin campos editables.
          </p>
        )}
      </div>
    </section>
  );
}

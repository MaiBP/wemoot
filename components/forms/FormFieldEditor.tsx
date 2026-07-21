"use client";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { RegistrationFormField } from "@/types/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FormFieldEditor({
  field,
  onChange,
  onDelete,
}: {
  field: RegistrationFormField;
  onChange: (changes: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 text-sm">
      <div className="min-w-48 flex-1 space-y-1">
        <Input
          defaultValue={field.label}
          aria-label="Etiqueta"
          onBlur={(event) =>
            event.target.value !== field.label &&
            onChange({ label: event.target.value })
          }
        />
        <p className="text-xs text-brand-black/45">
          {field.field_key} · {field.field_type}
        </p>
        {field.options.length > 0 && (
          <Input
            defaultValue={field.options
              .map((option) =>
                typeof option === "string" ? option : option.label,
              )
              .join(", ")}
            aria-label="Opciones"
            onBlur={(event) =>
              onChange({
                options: event.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          />
        )}
      </div>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(event) => onChange({ required: event.target.checked })}
        />{" "}
        Obligatorio
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={field.is_active}
          onChange={(event) => onChange({ is_active: event.target.checked })}
        />{" "}
        Activo
      </label>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Subir"
        onClick={() => onChange({ sort_order: field.sort_order - 1 })}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Bajar"
        onClick={() => onChange({ sort_order: field.sort_order + 1 })}
      >
        <ArrowDown className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Eliminar"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

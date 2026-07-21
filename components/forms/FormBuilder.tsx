"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  RegistrationFormField,
  RegistrationFormRecord,
  RegistrationFormSection,
} from "@/types/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSectionEditor } from "@/components/forms/FormSectionEditor";
import { FormPreview } from "@/components/forms/FormPreview";

export function FormBuilder({
  eventId,
  form,
  sections,
  fields,
}: {
  eventId: string;
  form: RegistrationFormRecord | null;
  sections: RegistrationFormSection[];
  fields: RegistrationFormField[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const endpoint = `/api/events/${eventId}/registration-form`;

  async function request(method: string, body?: unknown, url = endpoint) {
    setBusy(true);
    setError("");
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "No se pudo guardar");
      return false;
    }
    router.refresh();
    return true;
  }
  if (!form)
    return (
      <div className="rounded-2xl border bg-white p-8 text-center">
        <h2 className="text-xl font-bold">
          Configura el formulario de inscripción
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-brand-black/55">
          La plantilla Campus de fútbol completo crea las secciones deportivas,
          médicas y de autorizaciones para que luego puedas personalizarlas.
        </p>
        {error && <p className="mt-3 text-sm text-brand-magenta">{error}</p>}
        <div className="mt-5 flex justify-center gap-3">
          <Button
            disabled={busy}
            onClick={() =>
              request("POST", { action: "create_campus_template" })
            }
          >
            Usar plantilla Campus completo
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => request("POST", { action: "create_blank" })}
          >
            Crear desde cero
          </Button>
        </div>
      </div>
    );

  async function addSection(data: FormData) {
    await request("POST", {
      action: "add_section",
      data: Object.fromEntries(data),
    });
  }
  async function addField(data: FormData) {
    const raw = Object.fromEntries(data);
    await request("POST", {
      action: "add_field",
      data: {
        ...raw,
        required: false,
        options: String(raw.options ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
    });
  }
  const update = (
    entity: "section" | "field",
    id: string,
    changes: Record<string, unknown>,
  ) => request("PATCH", { entity, id, changes });
  const remove = (entity: "section" | "field", id: string) =>
    confirm("¿Eliminar este elemento?") &&
    request("DELETE", undefined, `${endpoint}?entity=${entity}&id=${id}`);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{form.name}</h2>
          <p className="text-sm text-brand-black/50">Estado: {form.status}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPreview(!preview)}>
            {preview ? "Editar" : "Previsualizar"}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              request("PATCH", {
                entity: "form",
                status: form.status === "published" ? "draft" : "published",
              })
            }
          >
            {form.status === "published"
              ? "Volver a borrador"
              : "Publicar formulario"}
          </Button>
        </div>
      </header>
      {error && (
        <p className="rounded-xl bg-brand-magenta/10 p-3 text-sm">{error}</p>
      )}
      {preview ? (
        <FormPreview sections={sections} fields={fields} />
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <FormSectionEditor
              key={section.id}
              section={section}
              fields={fields
                .filter((field) => field.section_id === section.id)
                .sort((a, b) => a.sort_order - b.sort_order)}
              update={update}
              remove={remove}
            />
          ))}
        </div>
      )}
      {!preview && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            action={addSection}
            className="grid gap-3 rounded-2xl border p-4"
          >
            <h3 className="font-semibold">Añadir sección</h3>
            <div>
              <Label>Título</Label>
              <Input name="title" required />
            </div>
            <div>
              <Label>Clave</Label>
              <Input name="section_key" pattern="[a-z][a-z0-9_]*" required />
            </div>
            <Button disabled={busy}>Añadir sección</Button>
          </form>
          <form action={addField} className="grid gap-3 rounded-2xl border p-4">
            <h3 className="font-semibold">Añadir campo</h3>
            <div>
              <Label>Sección</Label>
              <select
                name="section_id"
                className="h-10 w-full rounded-xl border bg-white px-3"
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Etiqueta</Label>
              <Input name="label" required />
            </div>
            <div>
              <Label>Clave</Label>
              <Input name="field_key" pattern="[a-z][a-z0-9_]*" required />
            </div>
            <div>
              <Label>Tipo</Label>
              <select
                name="field_type"
                className="h-10 w-full rounded-xl border bg-white px-3"
              >
                <option value="text">Texto</option>
                <option value="textarea">Texto largo</option>
                <option value="email">Email</option>
                <option value="phone">Teléfono</option>
                <option value="number">Número</option>
                <option value="date">Fecha</option>
                <option value="select">Lista</option>
                <option value="radio">Opciones</option>
                <option value="boolean">Sí/No</option>
              </select>
            </div>
            <div>
              <Label>Opciones separadas por comas</Label>
              <Input name="options" />
            </div>
            <Button disabled={busy}>Añadir campo</Button>
          </form>
        </div>
      )}
    </div>
  );
}

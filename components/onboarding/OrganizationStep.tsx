import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrganizationStep({ data }: { data: Record<string, string> }) {
  return (
    <div>
      <h2 className="text-2xl font-bold">Tu organización</h2>
      <p className="mt-2 text-brand-black/55">
        Podrás completar los datos fiscales más adelante.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          label="Nombre de la organización *"
          name="name"
          defaultValue={data.name}
        />
        <Field
          label="Tipo"
          name="type"
          defaultValue={data.type}
          placeholder="Club, academia, empresa…"
        />
        <Field
          label="Email de contacto"
          name="contact_email"
          type="email"
          defaultValue={data.contact_email}
        />
        <Field
          label="Teléfono de contacto"
          name="contact_phone"
          defaultValue={data.contact_phone}
        />
        <Field
          label="Dirección administrativa"
          name="address_line_1"
          defaultValue={data.address_line_1}
        />
        <Field label="Provincia" name="province" defaultValue={data.province} />
        <Field
          label="Código postal"
          name="postal_code"
          defaultValue={data.postal_code}
        />
        <Field
          label="Página web"
          name="website_url"
          type="url"
          defaultValue={data.website_url}
          placeholder="https://"
        />
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}

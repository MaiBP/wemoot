import type { ProfileType } from "@/lib/onboarding/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PersonalDataStep({
  data,
  profileType,
}: {
  data: Record<string, string>;
  profileType: ProfileType | null;
}) {
  const independent =
    profileType === "coach" ||
    profileType === "sports_organizer" ||
    profileType === "other";
  return (
    <div>
      <h2 className="text-2xl font-bold">Tus datos básicos</h2>
      <p className="mt-2 text-brand-black/55">Sólo te los pediremos una vez.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          label="Nombre completo *"
          name="full_name"
          defaultValue={data.full_name}
          autoComplete="name"
        />
        <Field
          label="Email *"
          name="email"
          type="email"
          defaultValue={data.email}
          autoComplete="email"
        />
        <Field
          label="Teléfono"
          name="phone"
          defaultValue={data.phone}
          autoComplete="tel"
        />
        <Field label="Ciudad habitual *" name="city" defaultValue={data.city} />
        <Field
          label="País *"
          name="country"
          defaultValue={data.country || "España"}
        />
        <div>
          <Label htmlFor="language">Idioma</Label>
          <select
            id="language"
            name="language"
            defaultValue={data.language || "es"}
            className="h-10 w-full rounded-xl border border-brand-black/15 bg-white px-3 text-sm"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
        <Field
          label="Zona horaria"
          name="timezone"
          defaultValue={data.timezone || "Europe/Madrid"}
        />
        {independent && (
          <Field
            label="Nombre profesional o marca"
            name="professional_name"
            defaultValue={data.professional_name}
          />
        )}
        {independent && (
          <Field
            label="Club o academia actual"
            name="current_club"
            defaultValue={data.current_club}
          />
        )}
        {independent && (
          <Field
            label="Especialidad"
            name="specialty"
            defaultValue={data.specialty}
          />
        )}
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

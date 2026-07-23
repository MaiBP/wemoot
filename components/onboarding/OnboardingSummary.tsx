import { CheckCircle2, MapPin } from "lucide-react";
import { profileTypeLabels, type ProfileType } from "@/lib/onboarding/schema";

export function OnboardingSummary({
  profileType,
  profile,
  organization,
  location,
}: {
  profileType: ProfileType;
  profile: Record<string, string>;
  organization: Record<string, string>;
  location: Record<string, string>;
}) {
  return (
    <div>
      <CheckCircle2 className="size-12 text-brand-cyan" />
      <h2 className="mt-4 text-2xl font-bold">Todo listo para empezar</h2>
      <p className="mt-2 text-brand-black/55">
        Usaremos estos datos como sugerencias; podrás cambiarlos en cada evento.
      </p>
      <dl className="mt-6 space-y-3 rounded-2xl bg-brand-black/[0.04] p-5">
        <Row label="Perfil" value={profileTypeLabels[profileType]} />
        <Row label="Nombre" value={profile.full_name} />
        <Row label="Ciudad" value={profile.city} />
        {organization.name && (
          <Row label="Organización" value={organization.name} />
        )}
        {location.name && (
          <div className="flex items-center gap-3 border-t pt-3">
            <MapPin className="size-4 text-brand-magenta" />
            <div>
              <dt className="text-xs text-brand-black/45">
                Instalación habitual
              </dt>
              <dd className="font-medium">{location.name}</dd>
            </div>
          </div>
        )}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs text-brand-black/45">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}

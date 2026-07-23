"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileTypeStep } from "@/components/onboarding/ProfileTypeStep";
import { PersonalDataStep } from "@/components/onboarding/PersonalDataStep";
import { OrganizationStep } from "@/components/onboarding/OrganizationStep";
import { LocationStep } from "@/components/onboarding/LocationStep";
import { OnboardingSummary } from "@/components/onboarding/OnboardingSummary";
import {
  profileNeedsOrganization,
  type ProfileType,
} from "@/lib/onboarding/schema";

type Values = Record<string, string>;

export function OnboardingWizard({
  initial,
}: {
  initial: {
    profile: Record<string, unknown>;
    organization: Record<string, unknown> | null;
    defaultLocation: Record<string, unknown> | null;
  };
}) {
  const router = useRouter();
  const [profileType, setProfileType] = useState<ProfileType | null>(
    (initial.profile.profile_type as ProfileType | null) ?? null,
  );
  const [profile, setProfile] = useState<Values>(() =>
    stringValues(initial.profile),
  );
  const [organization, setOrganization] = useState<Values>(() =>
    stringValues(initial.organization),
  );
  const [location, setLocation] = useState<Values>(() =>
    stringValues(initial.defaultLocation),
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const steps = useMemo(
    () =>
      profileNeedsOrganization(profileType)
        ? ["Perfil", "Datos", "Organización", "Ubicación", "Confirmación"]
        : ["Perfil", "Datos", "Ubicación", "Confirmación"],
    [profileType],
  );
  const current = steps[step];

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      if (current === "Perfil") {
        if (!profileType) throw new Error("Selecciona un tipo de perfil");
        await post("/api/onboarding/profile", { profile_type: profileType });
      } else if (current === "Datos") {
        const values = formValues(formData);
        const result = await post("/api/onboarding/profile", values);
        setProfile(stringValues(result.profile));
      } else if (current === "Organización") {
        const values = formValues(formData);
        const result = await post("/api/onboarding/organization", {
          ...values,
          city: profile.city,
          country: profile.country,
        });
        setOrganization(stringValues(result.organization));
      } else if (current === "Ubicación") {
        const values = formValues(formData);
        if (values.name) {
          const result = await post("/api/onboarding/location", {
            ...values,
            organization_id: organization.id || null,
            is_default: true,
          });
          setLocation(stringValues(result.location));
        }
      } else {
        await post("/api/onboarding/complete", {});
        router.push("/dashboard");
        router.refresh();
        return;
      }
      setStep((value) => Math.min(value + 1, steps.length - 1));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo guardar el paso",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-7 flex items-center justify-between">
        <div className="text-3xl font-black tracking-[-0.06em]">
          We<span className="text-brand-cyan">Moot</span>
        </div>
        <span className="text-sm font-medium text-brand-black/50">
          {step + 1} de {steps.length}
        </span>
      </div>
      <div className="mb-8 flex gap-2" aria-label="Progreso del onboarding">
        {steps.map((label, index) => (
          <div
            key={label}
            className={`h-2 flex-1 rounded-full ${index <= step ? (index % 3 === 0 ? "bg-brand-magenta" : index % 3 === 1 ? "bg-brand-cyan" : "bg-brand-yellow") : "bg-brand-black/10"}`}
          />
        ))}
      </div>
      <form
        action={submit}
        className="rounded-3xl border border-brand-black/10 bg-white p-6 shadow-2xl shadow-brand-cyan/10 sm:p-9"
      >
        {current === "Perfil" && (
          <ProfileTypeStep value={profileType} onChange={setProfileType} />
        )}
        {current === "Datos" && (
          <PersonalDataStep data={profile} profileType={profileType} />
        )}
        {current === "Organización" && <OrganizationStep data={organization} />}
        {current === "Ubicación" && (
          <LocationStep data={{ ...profile, ...location }} />
        )}
        {current === "Confirmación" && profileType && (
          <OnboardingSummary
            profileType={profileType}
            profile={profile}
            organization={organization}
            location={location}
          />
        )}
        {error && (
          <p className="mt-5 rounded-xl border-l-4 border-brand-magenta bg-brand-magenta/10 p-3 text-sm">
            {error}
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t pt-5">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0 || busy}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
          >
            <ArrowLeft className="size-4" /> Volver
          </Button>
          <div className="flex gap-2">
            {current === "Ubicación" && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setStep((value) => Math.min(value + 1, steps.length - 1))
                }
              >
                Ahora no
              </Button>
            )}
            <Button disabled={busy || (current === "Perfil" && !profileType)}>
              {busy
                ? "Guardando…"
                : current === "Confirmación"
                  ? "Ir al dashboard"
                  : "Continuar"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </form>
      <p className="mt-5 text-center text-xs text-brand-black/45">
        Tu progreso se guarda después de cada paso.
      </p>
    </div>
  );
}

function formValues(formData: FormData) {
  return Object.fromEntries(
    Array.from(formData.entries()).flatMap(([key, value]) => {
      const text = String(value).trim();
      return text ? [[key, text]] : [];
    }),
  );
}

function stringValues(
  value: Record<string, unknown> | null | undefined,
): Values {
  return Object.fromEntries(
    Object.entries(value ?? {}).map(([key, item]) => [
      key,
      item == null ? "" : String(item),
    ]),
  );
}

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "No se pudo guardar");
  return result;
}

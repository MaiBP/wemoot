import {
  Building2,
  CalendarHeart,
  Dumbbell,
  GraduationCap,
  Shield,
  Sparkles,
} from "lucide-react";
import type { ProfileType } from "@/lib/onboarding/schema";
import { profileTypeLabels } from "@/lib/onboarding/schema";

const options = [
  ["club", Shield],
  ["academy", GraduationCap],
  ["coach", Dumbbell],
  ["sports_organizer", CalendarHeart],
  ["event_company", Building2],
  ["other", Sparkles],
] as const;

export function ProfileTypeStep({
  value,
  onChange,
}: {
  value: ProfileType | null;
  onChange: (value: ProfileType) => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold">¿Cómo vas a utilizar WeMoot?</h2>
      <p className="mt-2 text-brand-black/55">
        Adaptaremos el asistente y los valores predeterminados a tu actividad.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {options.map(([type, Icon]) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${value === type ? "border-brand-cyan bg-brand-cyan/10 ring-2 ring-brand-cyan/20" : "border-brand-black/10 hover:border-brand-cyan/50"}`}
          >
            <span className="rounded-xl bg-brand-black p-2 text-white">
              <Icon className="size-5" />
            </span>
            <span className="font-semibold">{profileTypeLabels[type]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

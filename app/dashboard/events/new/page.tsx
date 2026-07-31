import { Card, CardContent } from "@/components/ui/card";
import { EventForm } from "@/components/forms/event-form";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingStatus } from "@/lib/onboarding/get-onboarding-status";
import { buildEventDefaults } from "@/lib/onboarding/event-defaults";
export default async function NewEventPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const status = user ? await getOnboardingStatus(supabase, user.id) : null;
  const defaults = status ? buildEventDefaults(status) : null;
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7">
        <h1 className="text-3xl font-bold tracking-tight">Nuevo evento</h1>
        <p className="mt-1 text-brand-black/60">
          Crea un evento básico o configura manualmente la estructura inicial
          de un evento avanzado.
        </p>
      </header>
      <Card>
        <CardContent>
          <EventForm
            defaults={{
              city: defaults?.city ?? "",
              location: defaults?.location ?? "",
              location_id: defaults?.location_id ?? "",
              contact_email: defaults?.contact_email ?? "",
              contact_phone: defaults?.contact_phone ?? "",
            }}
            locations={status?.locations ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}

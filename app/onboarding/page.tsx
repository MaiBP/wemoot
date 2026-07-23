import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingStatus } from "@/lib/onboarding/get-onboarding-status";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const status = await getOnboardingStatus(supabase, user.id);
  const { edit } = await searchParams;
  if (status.completed && edit !== "1") redirect("/dashboard");
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(2,169,234,.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(255,1,251,.10),transparent_30%)] p-4 py-10">
      <div className="absolute inset-x-0 top-0 flex h-2">
        <span className="flex-1 bg-brand-magenta" />
        <span className="flex-1 bg-brand-cyan" />
        <span className="flex-1 bg-brand-yellow" />
      </div>
      <OnboardingWizard
        initial={{
          profile: status.profile,
          organization: status.organization,
          defaultLocation: status.defaultLocation,
        }}
      />
    </main>
  );
}

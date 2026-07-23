import { createClient } from "@/lib/supabase/server";
import {
  completeOnboarding,
  OnboardingError,
} from "@/lib/onboarding/complete-onboarding";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    const profile = await completeOnboarding(supabase, user.id);
    return Response.json({ profile });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof OnboardingError
            ? error.message
            : "No se pudo completar el onboarding",
      },
      { status: 400 },
    );
  }
}

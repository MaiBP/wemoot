import { createClient } from "@/lib/supabase/server";
import { createOrUpdateProfile } from "@/lib/onboarding/create-or-update-profile";
import { getOnboardingStatus } from "@/lib/onboarding/get-onboarding-status";
import { profileProgressSchema } from "@/lib/onboarding/schema";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    return Response.json(await getOnboardingStatus(supabase, user.id));
  } catch {
    return Response.json(
      { error: "No se pudo cargar el perfil" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });
  const parsed = profileProgressSchema.safeParse(await request.json());
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  try {
    const profile = await createOrUpdateProfile(supabase, user.id, parsed.data);
    return Response.json({ profile });
  } catch {
    return Response.json(
      { error: "No se pudo guardar el perfil" },
      { status: 400 },
    );
  }
}

import { createClient } from "@/lib/supabase/server";
import { createLocation } from "@/lib/onboarding/create-location";
import { onboardingLocationSchema } from "@/lib/onboarding/schema";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });
  const parsed = onboardingLocationSchema.safeParse(await request.json());
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  try {
    const location = await createLocation(supabase, user.id, parsed.data);
    return Response.json({ location });
  } catch {
    return Response.json(
      { error: "No se pudo guardar la ubicación" },
      { status: 400 },
    );
  }
}

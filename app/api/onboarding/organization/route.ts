import { createClient } from "@/lib/supabase/server";
import { createOrganization } from "@/lib/onboarding/create-organization";
import { onboardingOrganizationSchema } from "@/lib/onboarding/schema";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });
  const parsed = onboardingOrganizationSchema.safeParse(await request.json());
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  try {
    const organization = await createOrganization(
      supabase,
      user.id,
      parsed.data,
    );
    return Response.json({ organization });
  } catch {
    return Response.json(
      { error: "No se pudo guardar la organización" },
      { status: 400 },
    );
  }
}

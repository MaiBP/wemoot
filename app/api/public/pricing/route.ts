import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PricingError } from "@/lib/pricing/calculate-price";
import { calculateRegistrationPrice } from "@/lib/pricing/calculate-registration-price";

const schema = z.object({
  eventId: z.uuid(),
  programId: z.uuid(),
  periodIds: z.array(z.uuid()).min(1).max(52),
  participantType: z.string().trim().min(2).max(40),
  discountCode: z.string().trim().max(40).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Selección no válida" },
        { status: 400 },
      );
    const admin = createAdminClient();
    const { data: event } = await admin
      .from("events")
      .select("id")
      .eq("id", parsed.data.eventId)
      .eq("status", "published")
      .maybeSingle();
    if (!event)
      return NextResponse.json(
        { error: "Evento no disponible" },
        { status: 404 },
      );
    const calculation = await calculateRegistrationPrice(parsed.data, admin);
    return NextResponse.json({ calculation });
  } catch (error) {
    if (error instanceof PricingError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Public pricing error", error);
    return NextResponse.json(
      { error: "No se pudo calcular el precio" },
      { status: 500 },
    );
  }
}

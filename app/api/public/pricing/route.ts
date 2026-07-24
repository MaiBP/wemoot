import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PricingError } from "@/lib/pricing/calculate-price";
import { calculateRegistrationPrice } from "@/lib/pricing/calculate-registration-price";

const schema = z.object({
  eventId: z.uuid(),
  selections: z
    .array(
      z.object({
        programId: z.uuid(),
        periodIds: z.array(z.uuid()).min(1).max(52),
      }),
    )
    .min(1)
    .max(10),
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
    const calculations = await Promise.all(
      parsed.data.selections.map((selection) =>
        calculateRegistrationPrice(
          {
            eventId: parsed.data.eventId,
            programId: selection.programId,
            periodIds: selection.periodIds,
            participantType: parsed.data.participantType,
            discountCode: parsed.data.discountCode,
          },
          admin,
        ),
      ),
    );
    const currencies = new Set(
      calculations.map((calculation) => calculation.currency),
    );
    if (currencies.size !== 1)
      throw new PricingError(
        "NO_MATCHING_RULE",
        "Las modalidades seleccionadas deben utilizar la misma moneda.",
      );
    const calculation = {
      baseAmount: calculations.reduce(
        (sum, calculation) => sum + calculation.baseAmount,
        0,
      ),
      finalAmount: calculations.reduce(
        (sum, calculation) => sum + calculation.finalAmount,
        0,
      ),
      discounts: calculations.flatMap((calculation) => calculation.discounts),
      currency: calculations[0].currency,
      items: calculations.map((calculation, index) => ({
        programId: parsed.data.selections[index].programId,
        periodIds: parsed.data.selections[index].periodIds,
        calculation,
      })),
    };
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

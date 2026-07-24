import { NextResponse } from "next/server";
import { processPreregistrationQueues } from "@/lib/preregistration/queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const result = await processPreregistrationQueues(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}

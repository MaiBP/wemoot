import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseEventMessage } from "@/lib/event-parser";
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json();
  if (typeof body.message !== "string" || !body.message.trim())
    return NextResponse.json({ error: "Mensaje no válido" }, { status: 400 });
  try {
    return NextResponse.json(
      await parseEventMessage(body.message, body.existing ?? {}),
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo interpretar el mensaje" },
      { status: 422 },
    );
  }
}

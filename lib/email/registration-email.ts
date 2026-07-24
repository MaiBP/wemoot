import type { SupabaseClient } from "@supabase/supabase-js";

export type RegistrationEmailType =
  | "registration_received"
  | "preregistration_received"
  | "payment_invitation"
  | "payment_confirmed"
  | "payment_expired"
  | "registration_cancelled";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailCopy(
  type: RegistrationEmailType,
  registration: {
    participant_name: string;
    total_amount: number | null;
    currency: string | null;
    queue_position: number | null;
    public_token: string;
    payment_expires_at: string | null;
    events:
      | { title: string; slug: string }
      | Array<{ title: string; slug: string }>
      | null;
    event_programs: { name: string } | Array<{ name: string }> | null;
  },
) {
  const eventTitle = firstRelation(registration.events)?.title ?? "tu evento";
  const program = firstRelation(registration.event_programs)?.name;
  const amount = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: registration.currency ?? "EUR",
  }).format(Number(registration.total_amount ?? 0));
  const detail = program ? `${eventTitle} · ${program}` : eventTitle;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  if (type === "payment_confirmed")
    return {
      subject: `Pago confirmado · ${eventTitle}`,
      heading: "Pago confirmado",
      message: `Hemos confirmado el pago de ${amount} y tu plaza para ${detail}.`,
    };
  if (type === "registration_cancelled")
    return {
      subject: `Inscripción cancelada · ${eventTitle}`,
      heading: "Inscripción cancelada",
      message: `La inscripción para ${detail} ha sido cancelada. Contacta con la organización si necesitas ayuda.`,
    };
  if (type === "preregistration_received")
    return {
      subject: `Preinscripción recibida · ${eventTitle}`,
      heading: "Preinscripción recibida",
      message: `Tu posición provisional es la ${registration.queue_position ?? "pendiente"}. Te avisaremos cuando puedas realizar el pago; la plaza todavía no está garantizada.`,
    };
  if (type === "payment_invitation") {
    const deadline = registration.payment_expires_at
      ? new Intl.DateTimeFormat("es-ES", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: "Europe/Madrid",
        }).format(new Date(registration.payment_expires_at))
      : "la fecha indicada";
    return {
      subject: `Ya puedes pagar · ${eventTitle}`,
      heading: "Ya puedes confirmar tu plaza",
      message: `Ya puedes completar el pago de tu inscripción para ${detail}. Tienes hasta ${deadline}; después la plaza pasará a la siguiente persona.`,
      actionUrl: `${appUrl}/pay/${registration.public_token}`,
      actionLabel: "Pagar ahora",
    };
  }
  if (type === "payment_expired")
    return {
      subject: `Plazo de pago finalizado · ${eventTitle}`,
      heading: "El plazo de pago ha finalizado",
      message: `La plaza para ${detail} ha pasado a la siguiente persona de la lista porque no recibimos el pago dentro del plazo.`,
    };
  return {
    subject: `Inscripción recibida · ${eventTitle}`,
    heading: "Inscripción recibida",
    message: `Hemos recibido correctamente la inscripción para ${detail}. La organización podrá contactarte si falta algún paso.`,
  };
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function sendRegistrationEmail(
  admin: SupabaseClient,
  registrationId: string,
  type: RegistrationEmailType,
) {
  const { data: registration, error: registrationError } = await admin
    .from("registrations")
    .select(
      "id,event_id,participant_name,participant_email,total_amount,currency,queue_position,public_token,payment_expires_at,events(title,slug),event_programs(name)",
    )
    .eq("id", registrationId)
    .maybeSingle();
  if (registrationError) throw registrationError;
  if (!registration?.participant_email) return { status: "skipped" as const };

  let { data: delivery } = await admin
    .from("email_deliveries")
    .select("id,status")
    .eq("registration_id", registration.id)
    .eq("email_type", type)
    .maybeSingle();
  if (!delivery) {
    const inserted = await admin
      .from("email_deliveries")
      .insert({
        event_id: registration.event_id,
        registration_id: registration.id,
        email_type: type,
        recipient: registration.participant_email,
      })
      .select("id,status")
      .maybeSingle();
    if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
    delivery = inserted.data;
    if (!delivery) {
      const existing = await admin
        .from("email_deliveries")
        .select("id,status")
        .eq("registration_id", registration.id)
        .eq("email_type", type)
        .single();
      if (existing.error) throw existing.error;
      delivery = existing.data;
    }
  }
  if (delivery.status === "sent") return { status: "sent" as const };
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    return { status: "queued" as const };

  const claim = await admin
    .from("email_deliveries")
    .update({
      status: "sending",
      attempt_count: 1,
      last_error: null,
    })
    .eq("id", delivery.id)
    .in("status", ["queued", "failed"])
    .select("id")
    .maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) return { status: "sending" as const };

  const copy = emailCopy(type, registration);
  const action =
    "actionUrl" in copy && copy.actionUrl
      ? `<p style="margin:28px 0"><a href="${escapeHtml(copy.actionUrl)}" style="display:inline-block;background:#02A9EA;color:#000300;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700">${escapeHtml(copy.actionLabel)}</a></p>`
      : "";
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f7f7f7;font-family:Arial,sans-serif;color:#000300"><div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden"><div style="height:8px;background:linear-gradient(90deg,#FF01FB 0 33%,#02A9EA 33% 66%,#FAFF00 66%)"></div><div style="padding:32px"><div style="font-size:28px;font-weight:800">We<span style="color:#02A9EA">Moot</span></div><h1 style="font-size:24px;margin:28px 0 12px">${escapeHtml(copy.heading)}</h1><p style="font-size:16px;line-height:1.6">Hola ${escapeHtml(registration.participant_name)},</p><p style="font-size:16px;line-height:1.6">${escapeHtml(copy.message)}</p>${action}<p style="margin-top:30px;color:#666;font-size:13px">Este mensaje no incluye datos médicos ni respuestas sensibles.</p></div></div></body></html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `${type}/${registration.id}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [registration.participant_email],
        subject: copy.subject,
        html,
      }),
    });
    const responseBody = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!response.ok) throw new Error(responseBody.message ?? "Email rejected");
    await admin
      .from("email_deliveries")
      .update({
        status: "sent",
        provider_message_id: responseBody.id ?? null,
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", delivery.id);
    return { status: "sent" as const };
  } catch (error) {
    await admin
      .from("email_deliveries")
      .update({
        status: "failed",
        last_error:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Unknown error",
      })
      .eq("id", delivery.id);
    return { status: "failed" as const };
  }
}

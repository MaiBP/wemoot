import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";

let stripe: Stripe | undefined;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY no está configurada");
  stripe ??= new Stripe(secretKey);
  return stripe;
}

export function createStripeCancelToken(registrationId: string) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY no está configurada");
  return createHmac("sha256", secretKey).update(registrationId).digest("hex");
}

export function isValidStripeCancelToken(registrationId: string, token: string) {
  const expected = createStripeCancelToken(registrationId);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

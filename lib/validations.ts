import { z } from "zod";

export const eventSchema = z.object({
  title: z.string().trim().min(3).max(120),
  event_type: z.string().trim().min(2).max(50),
  description: z.string().trim().max(2000).nullable().optional(),
  city: z.string().trim().min(2).max(100),
  location: z.string().trim().max(200).nullable().optional(),
  start_date: z.iso.date(),
  end_date: z.iso.date(),
  schedule: z.string().trim().max(200).nullable().optional(),
  age_range: z.string().trim().max(50).nullable().optional(),
  price: z.coerce.number().min(0).max(100000),
  capacity: z.coerce.number().int().positive().max(100000),
}).refine((data) => data.end_date >= data.start_date, { message: "La fecha final debe ser posterior a la inicial", path: ["end_date"] });

export const registrationSchema = z.object({
  event_id: z.uuid(),
  participant_name: z.string().trim().min(2).max(120),
  participant_email: z.email().nullable().optional(),
  participant_phone: z.string().trim().max(30).nullable().optional(),
  participant_age: z.coerce.number().int().min(3).max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const paymentUpdateSchema = z.object({ registration_id: z.uuid(), status: z.enum(["pending", "paid", "cancelled"]) });

export const publicRegistrationSchema = registrationSchema.extend({
  participant_email: z.email(),
  payment_method: z.enum(["cash", "card"]),
  website: z.string().max(0).optional(),
});

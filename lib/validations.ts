import { z } from "zod";

export const eventSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    event_type: z.string().trim().min(2).max(50),
    description: z.string().trim().max(2000).nullable().optional(),
    city: z.string().trim().min(2).max(100),
    location: z.string().trim().max(200).nullable().optional(),
    location_id: z.uuid().nullable().optional(),
    contact_email: z.email().nullable().optional(),
    contact_phone: z.string().trim().max(30).nullable().optional(),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    schedule: z.string().trim().max(200).nullable().optional(),
    age_range: z.string().trim().max(50).nullable().optional(),
    price: z.coerce.number().min(0).max(100000),
    capacity: z.coerce.number().int().positive().max(100000),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: "La fecha final debe ser posterior a la inicial",
    path: ["end_date"],
  });

export const registrationSchema = z.object({
  event_id: z.uuid(),
  participant_name: z.string().trim().min(2).max(120),
  participant_email: z.email().nullable().optional(),
  participant_phone: z.string().trim().max(30).nullable().optional(),
  participant_age: z.coerce
    .number()
    .int()
    .min(3)
    .max(100)
    .nullable()
    .optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const paymentUpdateSchema = z.object({
  registration_id: z.uuid(),
  status: z.enum(["pending", "paid", "cancelled"]),
});

export const organizationMemberSchema = z.object({
  email: z.email(),
  role: z.enum([
    "admin",
    "registration_manager",
    "coach",
    "medical_staff",
    "viewer",
  ]),
});

export const organizationMemberUpdateSchema = z.object({
  member_id: z.uuid(),
  role: z
    .enum(["admin", "registration_manager", "coach", "medical_staff", "viewer"])
    .optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const publicRegistrationSchema = registrationSchema.extend({
  participant_email: z.email(),
  payment_method: z.enum(["cash", "card"]),
  website: z.string().max(0).optional(),
  program_id: z.uuid().nullable().optional(),
  period_id: z.uuid().nullable().optional(),
  price_id: z.uuid().nullable().optional(),
  discount_code: z.string().trim().max(40).nullable().optional(),
  participant_birth_date: z.iso.date().nullable().optional(),
  guardian_name: z.string().trim().max(120).nullable().optional(),
  club_member: z.boolean().nullable().optional(),
  current_club: z.string().trim().max(120).nullable().optional(),
  shirt_size: z.string().trim().max(20).nullable().optional(),
  allergies: z.string().trim().max(1000).nullable().optional(),
  medical_notes: z.string().trim().max(1000).nullable().optional(),
  image_consent: z.boolean().default(false),
});

export const eventProgramSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(2).max(120),
    turn: z
      .enum(["morning", "afternoon", "full_day", "custom"])
      .default("custom"),
    description: z.string().trim().max(1000).nullable().optional(),
    start_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    end_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    min_age: z.coerce.number().int().min(3).max(100).nullable().optional(),
    max_age: z.coerce.number().int().min(3).max(100).nullable().optional(),
    capacity: z.coerce.number().int().positive().max(100000),
    payment_timing: z
      .enum(["immediate", "reserve", "deferred"])
      .default("immediate"),
    payment_due_date: z.iso.date().nullable().optional(),
    included_items: z.array(z.string().trim().min(1).max(100)).default([]),
    category: z.string().trim().max(100).nullable().optional(),
    min_birth_year: z.coerce
      .number()
      .int()
      .min(1900)
      .max(2200)
      .nullable()
      .optional(),
    max_birth_year: z.coerce
      .number()
      .int()
      .min(1900)
      .max(2200)
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      value.max_age == null ||
      value.min_age == null ||
      value.max_age >= value.min_age,
    {
      message: "La edad máxima debe ser mayor que la mínima",
      path: ["max_age"],
    },
  )
  .refine(
    (value) =>
      value.max_birth_year == null ||
      value.min_birth_year == null ||
      value.max_birth_year >= value.min_birth_year,
    {
      message: "El año máximo debe ser mayor que el mínimo",
      path: ["max_birth_year"],
    },
  );

export const eventPeriodSchema = z
  .object({
    id: z.uuid().optional(),
    label: z.string().trim().min(2).max(100),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
  })
  .refine((value) => value.end_date >= value.start_date, {
    message: "El periodo termina antes de comenzar",
    path: ["end_date"],
  });

export const eventPriceSchema = z.object({
  id: z.uuid().optional(),
  program_id: z.uuid(),
  period_id: z.uuid().nullable().optional(),
  label: z.string().trim().min(2).max(120),
  audience: z.enum(["all", "member", "non_member"]).default("all"),
  amount: z.coerce.number().min(0).max(100000),
});

export const eventProgramPeriodSchema = z.object({
  id: z.uuid(),
  program_id: z.uuid(),
  period_id: z.uuid(),
  capacity: z.coerce.number().int().positive().max(100000).nullable(),
  is_available: z.boolean(),
});

const optionalDateTimeSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine((value) => value == null || !Number.isNaN(Date.parse(value)), {
    message: "Fecha y hora no válidas",
  });

export const eventPriceRuleSchema = z
  .object({
    id: z.uuid().optional(),
    program_id: z.uuid().nullable().optional(),
    period_id: z.uuid().nullable().optional(),
    participant_type: z
      .enum([
        "general",
        "member",
        "non_member",
        "player",
        "goalkeeper",
        "custom",
      ])
      .default("general"),
    pricing_type: z.enum([
      "fixed",
      "per_period",
      "period_bundle",
      "full_event",
      "early_bird",
      "manual",
    ]),
    quantity_from: z.coerce
      .number()
      .int()
      .positive()
      .max(1000)
      .nullable()
      .optional(),
    quantity_to: z.coerce
      .number()
      .int()
      .positive()
      .max(1000)
      .nullable()
      .optional(),
    amount: z.coerce.number().min(0).max(100000),
    currency: z.string().trim().length(3).default("EUR"),
    label: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    priority: z.coerce.number().int().min(-10000).max(10000).default(0),
    starts_at: optionalDateTimeSchema,
    ends_at: optionalDateTimeSchema,
    is_active: z.boolean().default(true),
  })
  .refine(
    (value) =>
      value.quantity_to == null ||
      value.quantity_from == null ||
      value.quantity_to >= value.quantity_from,
    {
      message: "La cantidad máxima debe ser mayor que la mínima",
      path: ["quantity_to"],
    },
  )
  .refine(
    (value) =>
      value.ends_at == null ||
      value.starts_at == null ||
      Date.parse(value.ends_at) >= Date.parse(value.starts_at),
    { message: "La regla termina antes de comenzar", path: ["ends_at"] },
  );

export const eventDiscountSchema = z
  .object({
    id: z.uuid().optional(),
    program_id: z.uuid().nullable().optional(),
    code: z.string().trim().min(2).max(40).nullable().optional(),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    discount_type: z.enum([
      "percentage",
      "fixed_amount",
      "full_event",
      "bundle",
      "manual",
    ]),
    discount_value: z.coerce.number().min(0).max(100000),
    applies_to: z.enum(["event", "program"]).default("event"),
    min_periods: z.coerce
      .number()
      .int()
      .positive()
      .max(1000)
      .nullable()
      .optional(),
    starts_at: optionalDateTimeSchema,
    ends_at: optionalDateTimeSchema,
    usage_limit: z.coerce
      .number()
      .int()
      .positive()
      .max(1000000)
      .nullable()
      .optional(),
    priority: z.coerce.number().int().min(-10000).max(10000).default(0),
    is_combinable: z.boolean().default(false),
    is_active: z.boolean().default(true),
  })
  .refine(
    (value) =>
      value.discount_type !== "percentage" || value.discount_value <= 100,
    {
      message: "El porcentaje no puede superar el 100 %",
      path: ["discount_value"],
    },
  )
  .refine(
    (value) =>
      value.ends_at == null ||
      value.starts_at == null ||
      Date.parse(value.ends_at) >= Date.parse(value.starts_at),
    { message: "El descuento termina antes de comenzar", path: ["ends_at"] },
  );

export const registrationFormSectionSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  section_key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(60),
});

export const registrationFormFieldSchema = z.object({
  section_id: z.uuid(),
  field_key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(80),
  label: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).nullable().optional(),
  placeholder: z.string().trim().max(160).nullable().optional(),
  field_type: z.enum([
    "text",
    "textarea",
    "email",
    "phone",
    "number",
    "date",
    "select",
    "multiselect",
    "radio",
    "checkbox",
    "boolean",
    "file",
    "signature",
    "address",
    "country",
    "province",
    "postal_code",
    "image",
    "heading",
    "legal_text",
  ]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
});

export const dynamicRegistrationSchema = z.object({
  event_id: z.uuid(),
  form_id: z.uuid(),
  selections: z
    .array(
      z.object({
        program_id: z.uuid(),
        period_ids: z.array(z.uuid()).min(1).max(52),
        price_rule_id: z.uuid().optional(),
      }),
    )
    .min(1)
    .max(10)
    .refine(
      (items) =>
        new Set(items.map((item) => item.program_id)).size === items.length,
      "No puedes repetir una modalidad",
    ),
  participant_type: z.enum([
    "general",
    "member",
    "non_member",
    "player",
    "goalkeeper",
    "custom",
  ]),
  discount_code: z.string().trim().max(40).nullable().optional(),
  payment_method: z.enum(["cash", "card"]),
  answers: z.record(z.string(), z.unknown()),
  website: z.string().max(0).optional(),
});

export const preregistrationSettingsSchema = z.object({
  registration_mode: z.enum(["direct", "preregistration"]),
  allow_multiple_programs: z
    .union([
      z.boolean(),
      z.enum(["true", "false"]).transform((value) => value === "true"),
    ])
    .default(true),
  preregistration_limit: z.coerce.number().int().positive().max(100000),
  payment_invitation_hours: z.coerce.number().int().min(1).max(24),
});

export const advancedEventBaseSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    event_type: z.string().trim().min(2).max(50),
    description: z.string().trim().max(2000).nullable().optional(),
    city: z.string().trim().min(2).max(100),
    location: z.string().trim().max(200).nullable().optional(),
    location_id: z.uuid().nullable().optional(),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    schedule: z.string().trim().max(200).nullable().optional(),
    age_range: z.string().trim().max(50).nullable().optional(),
    organizer_name: z.string().trim().max(150).nullable().optional(),
    contact_email: z.email().nullable().optional(),
    contact_phone: z.string().trim().max(30).nullable().optional(),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: "La fecha final debe ser posterior a la inicial",
    path: ["end_date"],
  });

export const advancedEventDraftSchema = z.object({
  programs: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        turn: z
          .enum(["morning", "afternoon", "full_day", "custom"])
          .default("custom"),
        description: z.string().trim().max(1000).nullable().optional(),
        start_time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable()
          .optional(),
        end_time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable()
          .optional(),
        min_age: z.coerce.number().int().min(3).max(100).nullable().optional(),
        max_age: z.coerce.number().int().min(3).max(100).nullable().optional(),
        capacity: z.coerce
          .number()
          .int()
          .positive()
          .max(100000)
          .nullable()
          .optional(),
        payment_timing: z
          .enum(["immediate", "reserve", "deferred"])
          .default("immediate"),
        payment_due_date: z.iso.date().nullable().optional(),
        included_items: z.array(z.string().trim().min(1).max(100)).default([]),
      }),
    )
    .default([]),
  periods: z
    .array(
      z.object({
        label: z.string().trim().min(2).max(100),
        start_date: z.iso.date(),
        end_date: z.iso.date(),
      }),
    )
    .default([]),
  prices: z
    .array(
      z.object({
        program_name: z.string().trim().min(2).max(120),
        period_label: z.string().trim().max(100).nullable().optional(),
        label: z.string().trim().min(2).max(120),
        audience: z.enum(["all", "member", "non_member"]).default("all"),
        amount: z.coerce.number().min(0).max(100000),
        pricing_type: z
          .enum([
            "fixed",
            "per_period",
            "period_bundle",
            "full_event",
            "early_bird",
            "manual",
          ])
          .default("fixed"),
        quantity_from: z.coerce
          .number()
          .int()
          .positive()
          .max(52)
          .nullable()
          .optional(),
        quantity_to: z.coerce
          .number()
          .int()
          .positive()
          .max(52)
          .nullable()
          .optional(),
      }),
    )
    .default([]),
  uncertainties: z.array(z.string().trim().min(2).max(300)).default([]),
});

import type { RegistrationFieldType } from "@/types/event";

export interface TemplateField {
  key: string;
  label: string;
  type: RegistrationFieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  conditional?: Record<string, unknown>;
  validation?: Record<string, unknown>;
}

export interface TemplateSection {
  key: string;
  title: string;
  description?: string;
  fields: TemplateField[];
}

const consent = (
  key: string,
  label: string,
  required = true,
): TemplateField => ({
  key,
  label,
  type: "boolean",
  required,
  validation: { consent: true, version: "provisional-v1", provisional: true },
});

export const campusTemplate: TemplateSection[] = [
  {
    key: "participant",
    title: "Datos del participante",
    fields: [
      {
        key: "participant_name",
        label: "Nombre",
        type: "text",
        required: true,
      },
      {
        key: "first_surname",
        label: "Primer apellido",
        type: "text",
        required: true,
      },
      { key: "second_surname", label: "Segundo apellido", type: "text" },
      {
        key: "participant_birth_date",
        label: "Fecha de nacimiento",
        type: "date",
        required: true,
      },
      {
        key: "gender",
        label: "Género",
        type: "select",
        options: [
          "Femenino",
          "Masculino",
          "No binario",
          "Prefiero no indicarlo",
        ],
      },
      { key: "identity_document", label: "DNI, NIE o pasaporte", type: "text" },
      { key: "nationality", label: "Nacionalidad", type: "country" },
      { key: "address", label: "Dirección", type: "address" },
      { key: "city", label: "Ciudad", type: "text" },
      { key: "province", label: "Provincia", type: "province" },
      { key: "postal_code", label: "Código postal", type: "postal_code" },
    ],
  },
  {
    key: "guardian",
    title: "Padre, madre o tutor legal",
    fields: [
      {
        key: "guardian_name",
        label: "Nombre completo",
        type: "text",
        required: false,
      },
      {
        key: "guardian_relationship",
        label: "Relación con el menor",
        type: "text",
        required: true,
      },
      {
        key: "participant_email",
        label: "Email de contacto",
        type: "email",
        required: true,
      },
      {
        key: "participant_phone",
        label: "Teléfono principal",
        type: "phone",
        required: true,
      },
      {
        key: "emergency_contact",
        label: "Contacto de emergencia",
        type: "text",
        required: true,
      },
      {
        key: "emergency_phone",
        label: "Teléfono de emergencia",
        type: "phone",
        required: true,
      },
    ],
  },
  {
    key: "sports",
    title: "Información deportiva",
    fields: [
      { key: "current_club", label: "Club actual", type: "text" },
      { key: "team", label: "Equipo actual", type: "text" },
      {
        key: "position",
        label: "Posición principal",
        type: "select",
        options: [
          "Portero",
          "Defensa central",
          "Lateral derecho",
          "Lateral izquierdo",
          "Mediocentro",
          "Interior",
          "Extremo derecho",
          "Extremo izquierdo",
          "Mediapunta",
          "Delantero",
          "Otra",
        ],
      },
      {
        key: "level",
        label: "Nivel de juego",
        type: "select",
        options: ["Iniciación", "Intermedio", "Avanzado", "Élite"],
      },
      {
        key: "dominant_foot",
        label: "Pierna dominante",
        type: "radio",
        options: ["Derecha", "Izquierda", "Ambas"],
      },
      {
        key: "sports_notes",
        label: "Observaciones deportivas",
        type: "textarea",
      },
    ],
  },
  {
    key: "program_selection",
    title: "Modalidad y semanas",
    description: "La disponibilidad y el precio se calculan automáticamente.",
    fields: [],
  },
  {
    key: "equipment",
    title: "Material y equipación",
    fields: [
      {
        key: "shirt_size",
        label: "Talla de camiseta",
        type: "select",
        options: [
          "4",
          "6",
          "8",
          "10",
          "12",
          "14",
          "XS",
          "S",
          "M",
          "L",
          "XL",
          "XXL",
        ],
      },
      { key: "printed_name", label: "Nombre a imprimir", type: "text" },
      { key: "preferred_number", label: "Dorsal preferido", type: "number" },
    ],
  },
  {
    key: "medical",
    title: "Información médica",
    description: "Información sensible con acceso restringido.",
    fields: [
      { key: "has_allergies", label: "¿Tiene alergias?", type: "boolean" },
      {
        key: "allergies",
        label: "Detalle de alergias",
        type: "textarea",
        conditional: { field: "has_allergies", equals: true },
      },
      { key: "takes_medication", label: "¿Toma medicación?", type: "boolean" },
      {
        key: "medication",
        label: "Nombre, dosis y frecuencia",
        type: "textarea",
        conditional: { field: "takes_medication", equals: true },
      },
      {
        key: "recent_injury",
        label: "¿Tiene una lesión reciente?",
        type: "boolean",
      },
      {
        key: "injury_detail",
        label: "Detalle de la lesión",
        type: "textarea",
        conditional: { field: "recent_injury", equals: true },
      },
      {
        key: "medical_notes",
        label: "Otras observaciones médicas",
        type: "textarea",
      },
      {
        key: "medical_authorization",
        label: "Autorizo la asistencia médica necesaria",
        type: "boolean",
        required: true,
      },
    ],
  },
  {
    key: "consents",
    title: "Autorizaciones",
    description: "Textos provisionales pendientes de revisión legal.",
    fields: [
      consent(
        "participation_terms",
        "Acepto las condiciones provisionales de participación",
      ),
      consent(
        "data_processing",
        "Autorizo el tratamiento de datos para gestionar la inscripción",
      ),
      consent("image_consent", "Autorizo el uso de imagen", false),
      consent("emergency_care", "Autorizo la atención médica de urgencia"),
      consent(
        "cancellation_policy",
        "Acepto la política provisional de cancelación",
      ),
      consent(
        "truth_confirmation",
        "Confirmo que la información facilitada es veraz",
      ),
    ],
  },
  {
    key: "additional",
    title: "Información adicional",
    fields: [
      {
        key: "referral_source",
        label: "¿Cómo conoció el campus?",
        type: "text",
      },
      { key: "group_request", label: "Petición de agrupación", type: "text" },
      { key: "notes", label: "Observaciones", type: "textarea" },
      {
        key: "future_communications",
        label: "Acepto comunicaciones futuras",
        type: "boolean",
      },
    ],
  },
];

export const basicRegistrationTemplate: TemplateSection[] = [
  {
    key: "participant",
    title: "Datos del participante",
    fields: [
      {
        key: "participant_name",
        label: "Nombre",
        type: "text",
        required: true,
      },
      {
        key: "first_surname",
        label: "Primer apellido",
        type: "text",
        required: true,
      },
      {
        key: "participant_birth_date",
        label: "Fecha de nacimiento",
        type: "date",
        required: true,
      },
      {
        key: "participant_email",
        label: "Email",
        type: "email",
        required: true,
      },
      { key: "participant_phone", label: "Teléfono", type: "phone" },
    ],
  },
  {
    key: "program_selection",
    title: "Modalidad y periodos",
    description: "Selección dinámica según la configuración del evento.",
    fields: [],
  },
  {
    key: "consents",
    title: "Autorizaciones",
    fields: [
      consent(
        "participation_terms",
        "Acepto las condiciones provisionales de participación.",
      ),
      consent(
        "data_processing",
        "Autorizo el tratamiento provisional de los datos de inscripción.",
      ),
    ],
  },
];

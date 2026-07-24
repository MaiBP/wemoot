"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  EventIncludedItem,
  EventPeriod,
  EventProgram,
  EventProgramPeriod,
  RegistrationFormField,
  RegistrationFormRecord,
  RegistrationFormSection,
} from "@/types/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConditionalField } from "@/components/forms/ConditionalField";
import { ProgramSelector } from "@/components/forms/ProgramSelector";
import { PeriodSelector } from "@/components/forms/PeriodSelector";
import { PriceSummary } from "@/components/forms/PriceSummary";

type Calculation = {
  baseAmount: number;
  finalAmount: number;
  discounts: Array<{ name: string; amount: number }>;
  currency: string;
  items?: Array<{
    programId: string;
    periodIds: string[];
    calculation: {
      baseAmount: number;
      finalAmount: number;
      currency: string;
    };
  }>;
};
type Selection = { programId: string; periodIds: string[] };
const optionValue = (option: string | { label: string; value: string }) =>
  typeof option === "string" ? option : option.value;
const optionLabel = (option: string | { label: string; value: string }) =>
  typeof option === "string" ? option : option.label;

export function DynamicRegistrationForm({
  eventId,
  form,
  sections,
  fields,
  programs,
  periods,
  relations,
  includedItems,
  registrationMode,
  allowMultiplePrograms,
  allowIndividualPeriods,
}: {
  eventId: string;
  form: RegistrationFormRecord;
  sections: RegistrationFormSection[];
  fields: RegistrationFormField[];
  programs: EventProgram[];
  periods: EventPeriod[];
  relations: EventProgramPeriod[];
  includedItems: EventIncludedItem[];
  registrationMode: "direct" | "preregistration";
  allowMultiplePrograms: boolean;
  allowIndividualPeriods: boolean;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [selections, setSelections] = useState<Selection[]>([]);
  const [participantType, setParticipantType] = useState("non_member");
  const [discountCode, setDiscountCode] = useState("");
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [calculation, setCalculation] = useState<Calculation | null>(null);
  const [pricingError, setPricingError] = useState("");
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const storageKey = `wemoot-form-${form.id}`;
  const activeSections = useMemo(
    () =>
      sections.filter(
        (section) =>
          section.is_active &&
          (section.section_key !== "equipment" ||
            includedItems.some(
              (item) =>
                (item.program_id == null ||
                  selections.some(
                    (selection) => selection.programId === item.program_id,
                  )) &&
                item.requires_size,
            )),
      ),
    [sections, includedItems, selections],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        if (saved) {
          setAnswers(saved.answers ?? {});
          const restoredSelections =
            saved.selections ??
            (saved.programId
              ? [
                  {
                    programId: saved.programId,
                    periodIds: saved.periodIds ?? [],
                  },
                ]
              : []);
          setSelections(
            allowMultiplePrograms
              ? restoredSelections
              : restoredSelections.slice(0, 1),
          );
          setParticipantType(saved.participantType ?? "non_member");
          setStep(saved.step ?? 0);
        }
      } catch {}
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [allowMultiplePrograms, storageKey]);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ answers, selections, participantType, step }),
    );
  }, [answers, selections, participantType, step, storageKey, hydrated]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (Object.keys(answers).length) event.preventDefault();
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [answers]);
  useEffect(() => {
    if (
      !selections.length ||
      selections.some((selection) => !selection.periodIds.length)
    ) {
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoadingPrice(true);
      setPricingError("");
      fetch("/api/public/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          eventId,
          selections,
          participantType,
          discountCode: discountCode || undefined,
        }),
      })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          setCalculation(result.calculation);
        })
        .catch((cause) => {
          if (cause.name !== "AbortError") {
            setCalculation(null);
            setPricingError(cause.message);
          }
        })
        .finally(() => setLoadingPrice(false));
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [eventId, selections, participantType, discountCode]);

  const current = activeSections[step];
  const isReview = step === activeSections.length;
  const currentFields = fields.filter(
    (field) => field.is_active && field.section_id === current?.id,
  );
  const visible = (field: RegistrationFormField) => {
    const logic = field.conditional_logic as {
      field?: string;
      equals?: unknown;
    };
    return !logic.field || answers[logic.field] === logic.equals;
  };
  function next() {
    setError("");
    if (
      current?.section_key === "program_selection" &&
      (!selections.length ||
        selections.some((selection) => !selection.periodIds.length) ||
        !calculation)
    )
      return setError(
        "Selecciona modalidad y al menos una semana con precio disponible.",
      );
    const missing = currentFields.find(
      (field) =>
        visible(field) &&
        field.required &&
        (answers[field.field_key] == null ||
          answers[field.field_key] === "" ||
          answers[field.field_key] === false),
    );
    if (missing) return setError(`Completa el campo: ${missing.label}`);
    setStep((value) => Math.min(value + 1, activeSections.length));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function submit() {
    if (!calculation) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/public/registrations/dynamic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          form_id: form.id,
          selections: selections.map((selection) => ({
            program_id: selection.programId,
            period_ids: selection.periodIds,
          })),
          participant_type: participantType,
          discount_code: discountCode || null,
          payment_method: calculation.finalAmount === 0 ? "cash" : method,
          answers,
          website: "",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      localStorage.removeItem(storageKey);
      window.location.assign(result.checkout_url || result.success_url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar la inscripción",
      );
      setSubmitting(false);
    }
  }
  function renderField(field: RegistrationFormField) {
    const value = answers[field.field_key];
    const set = (next: unknown) =>
      setAnswers((current) => ({ ...current, [field.field_key]: next }));
    if (field.field_type === "heading" || field.field_type === "legal_text")
      return (
        <p className="rounded-xl bg-brand-yellow/20 p-3 text-sm">
          {field.label}
        </p>
      );
    if (field.field_type === "boolean" || field.field_type === "checkbox")
      return (
        <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => set(event.target.checked)}
          />
          <span>
            {field.label}
            {field.required && " *"}
          </span>
        </label>
      );
    if (["select", "radio", "multiselect"].includes(field.field_type))
      return (
        <div>
          <Label>
            {field.label}
            {field.required && " *"}
          </Label>
          <select
            value={String(value ?? "")}
            onChange={(event) => set(event.target.value)}
            className="h-11 w-full rounded-xl border bg-white px-3"
          >
            <option value="">Selecciona</option>
            {field.options.map((option) => (
              <option key={optionValue(option)} value={optionValue(option)}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </div>
      );
    if (field.field_type === "textarea")
      return (
        <div>
          <Label>
            {field.label}
            {field.required && " *"}
          </Label>
          <Textarea
            value={String(value ?? "")}
            placeholder={field.placeholder ?? undefined}
            onChange={(event) => set(event.target.value)}
          />
        </div>
      );
    const type =
      field.field_type === "phone"
        ? "tel"
        : ["email", "number", "date"].includes(field.field_type)
          ? field.field_type
          : "text";
    return (
      <div>
        <Label>
          {field.label}
          {field.required && " *"}
        </Label>
        <Input
          type={type}
          value={String(value ?? "")}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => set(event.target.value)}
        />
      </div>
    );
  }
  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs font-medium">
          <span>
            Paso {Math.min(step + 1, activeSections.length + 1)} de{" "}
            {activeSections.length + 1}
          </span>
          <span>{isReview ? "Revisión y pago" : current?.title}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-brand-black/10">
          <div
            className="h-full bg-brand-cyan transition-all"
            style={{
              width: `${((step + 1) / (activeSections.length + 1)) * 100}%`,
            }}
          />
        </div>
      </div>
      {!isReview && (
        <section>
          <h2 className="text-xl font-bold">{current?.title}</h2>
          {current?.description && (
            <p className="mt-1 text-sm text-brand-black/55">
              {current.description}
            </p>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {current?.section_key === "program_selection" ? (
              <div className="space-y-4 sm:col-span-2">
                <ProgramSelector
                  programs={programs}
                  values={selections.map((selection) => selection.programId)}
                  allowMultiple={allowMultiplePrograms}
                  onChange={(values) => {
                    setSelections((current) =>
                      values.map(
                        (programId) =>
                          current.find(
                            (selection) => selection.programId === programId,
                          ) ?? { programId, periodIds: [] },
                      ),
                    );
                    setCalculation(null);
                  }}
                />
                <div>
                  <Label>Tipo de participante</Label>
                  <select
                    value={participantType}
                    onChange={(event) => setParticipantType(event.target.value)}
                    className="h-11 w-full rounded-xl border bg-white px-3"
                  >
                    <option value="member">Socio</option>
                    <option value="non_member">No socio</option>
                    <option value="player">Jugador</option>
                    <option value="goalkeeper">Portero</option>
                  </select>
                </div>
                {selections.map((selection) => (
                  <div
                    key={selection.programId}
                    className="rounded-xl bg-brand-black/[0.025] p-4"
                  >
                    <h3 className="mb-3 font-bold">
                      {
                        programs.find(
                          (program) => program.id === selection.programId,
                        )?.name
                      }
                    </h3>
                    <PeriodSelector
                      periods={periods}
                      relations={relations}
                      programId={selection.programId}
                      values={selection.periodIds}
                      showCapacity={registrationMode === "direct"}
                      allowIndividualPeriods={allowIndividualPeriods}
                      onChange={(values) => {
                        setSelections((current) =>
                          current.map((item) =>
                            item.programId === selection.programId
                              ? { ...item, periodIds: values }
                              : item,
                          ),
                        );
                        setCalculation(null);
                      }}
                    />
                  </div>
                ))}
                <div>
                  <Label>Código de descuento</Label>
                  <Input
                    value={discountCode}
                    onChange={(event) =>
                      setDiscountCode(event.target.value.toUpperCase())
                    }
                  />
                </div>
                <PriceSummary
                  calculation={calculation}
                  loading={loadingPrice}
                  error={pricingError}
                />
              </div>
            ) : (
              currentFields.map((field) => (
                <ConditionalField
                  key={field.id}
                  logic={field.conditional_logic}
                  answers={answers}
                >
                  <div
                    className={
                      field.field_type === "textarea" ||
                      field.field_type === "legal_text"
                        ? "sm:col-span-2"
                        : ""
                    }
                  >
                    {renderField(field)}
                  </div>
                </ConditionalField>
              ))
            )}
          </div>
        </section>
      )}
      {isReview && (
        <section className="space-y-5">
          <h2 className="text-xl font-bold">Revisión y pago</h2>
          <PriceSummary calculation={calculation} loading={false} />
          <div className="rounded-xl border p-4 text-sm">
            <p>
              <strong>Participante:</strong>{" "}
              {String(answers.participant_name ?? "")}{" "}
              {String(answers.first_surname ?? "")}
            </p>
            <p>
              <strong>Modalidades:</strong> {selections.length}
            </p>
            <p>
              <strong>Periodos seleccionados:</strong>{" "}
              {selections.reduce(
                (total, selection) => total + selection.periodIds.length,
                0,
              )}
            </p>
          </div>
          {registrationMode === "preregistration" ? (
            <div className="rounded-xl bg-brand-yellow/25 p-4 text-sm leading-6">
              No realizarás ningún pago ahora. Guardaremos tu posición por orden
              de llegada y te avisaremos cuando puedas confirmar las plazas
              seleccionadas.
            </div>
          ) : calculation && calculation.finalAmount > 0 ? (
            <fieldset>
              <legend className="mb-2 font-medium">Forma de pago</legend>
              <label className="mr-5">
                <input
                  type="radio"
                  checked={method === "cash"}
                  onChange={() => setMethod("cash")}
                />{" "}
                Efectivo
              </label>
              <label>
                <input
                  type="radio"
                  checked={method === "card"}
                  onChange={() => setMethod("card")}
                />{" "}
                Tarjeta
              </label>
            </fieldset>
          ) : null}
        </section>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-brand-magenta/10 p-3 text-sm"
        >
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-between">
        <Button
          variant="outline"
          disabled={step === 0 || submitting}
          onClick={() => setStep((value) => value - 1)}
        >
          Anterior
        </Button>
        {isReview ? (
          <Button disabled={submitting || !calculation} onClick={submit}>
            {submitting && <Loader2 className="size-4 animate-spin" />}{" "}
            {registrationMode === "preregistration"
              ? "Enviar preinscripción"
              : "Confirmar inscripción"}
          </Button>
        ) : (
          <Button onClick={next}>Continuar</Button>
        )}
      </div>
    </div>
  );
}

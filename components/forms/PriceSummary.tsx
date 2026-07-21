import { formatCurrency } from "@/lib/utils";
export function PriceSummary({
  calculation,
  loading,
  error,
}: {
  calculation: {
    baseAmount: number;
    finalAmount: number;
    discounts: Array<{ name: string; amount: number }>;
    currency: string;
  } | null;
  loading: boolean;
  error?: string;
}) {
  return (
    <div className="rounded-xl bg-brand-cyan/10 p-4">
      {loading ? (
        <p>Calculando precio…</p>
      ) : error ? (
        <p className="text-brand-magenta">{error}</p>
      ) : calculation ? (
        <>
          <div className="flex justify-between">
            <span>Precio base</span>
            <span>{formatCurrency(calculation.baseAmount / 100)}</span>
          </div>
          {calculation.discounts.map((discount) => (
            <div
              key={discount.name}
              className="flex justify-between text-sm text-brand-black/60"
            >
              <span>{discount.name}</span>
              <span>−{formatCurrency(discount.amount / 100)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t pt-2 text-xl font-bold">
            <span>Total</span>
            <span>{formatCurrency(calculation.finalAmount / 100)}</span>
          </div>
        </>
      ) : (
        <p>Selecciona modalidad y semanas para calcular el total.</p>
      )}
    </div>
  );
}

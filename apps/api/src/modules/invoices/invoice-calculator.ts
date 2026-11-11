export type AdjustmentScope = "INVOICE" | "ITEMS";
export interface PriceLine { id: string; amount: number }
export interface PriceAdjustment { id: string; name: string; percentage: number; scope: AdjustmentScope; itemIds?: string[] }
export interface TaxRule { id: string; name: string; kind: "PERCENTAGE" | "FIXED"; value: number; treatment: "ADDITIVE" | "WITHHOLDING"; enabled: boolean; allowWithOtherTaxes: boolean }
export interface AppliedAdjustment { id: string; name: string; percentage: number; amount: number; scope: AdjustmentScope; itemIds?: string[]; itemIndexes?: number[] }
export interface AppliedTax { id: string; name: string; kind: TaxRule["kind"]; value: number; treatment: TaxRule["treatment"]; amount: number; allowWithOtherTaxes: boolean }
export interface InvoiceCalculation {
  subtotal: number; adjustedSubtotal: number; adjustmentTotal: number; taxableBase: number;
  additiveTaxTotal: number; withholdingTaxTotal: number; totalAmount: number;
  adjustments: AppliedAdjustment[]; taxes: AppliedTax[];
}
function assertMoney(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative whole-naira amount`);
}
function roundNaira(value: number): number { return Math.round(value); }

/** Percentage adjustments are independently based on their original scope subtotal.
 * Negative adjustments are discounts; positive adjustments are surcharges.
 * Combined discounts are capped at the original subtotal, allowing exactly zero
 * without allowing a negative invoice balance.
 */
export function calculateInvoice(lines: PriceLine[], adjustments: PriceAdjustment[] = [], taxes: TaxRule[] = []): InvoiceCalculation {
  if (lines.length === 0) throw new Error("An invoice must contain at least one line");
  const lineIds = new Set<string>();
  for (const line of lines) {
    if (!line.id || lineIds.has(line.id)) throw new Error("Invoice line IDs must be unique and non-empty");
    assertMoney(line.amount, "Line amount"); lineIds.add(line.id);
  }
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  assertMoney(subtotal, "Subtotal");
  const raw = adjustments.map((rule) => {
    if (!rule.id || !rule.name.trim()) throw new Error("Every adjustment requires an ID and name");
    if (!Number.isFinite(rule.percentage) || rule.percentage < -100 || rule.percentage > 1000) throw new Error("Adjustment percentage must be between -100 and 1000");
    const scoped = rule.scope === "INVOICE" ? lines : lines.filter((line) => (rule.itemIds ?? []).includes(line.id));
    if (rule.scope === "ITEMS" && scoped.length === 0) throw new Error(`Adjustment "${rule.name}" must select at least one invoice item`);
    const base = scoped.reduce((sum, line) => sum + line.amount, 0);
    return { rule, amount: roundNaira(base * Math.abs(rule.percentage) / 100) * Math.sign(rule.percentage) };
  });
  // Track remaining discount capacity per original line. A second discount
  // on one selected item must never consume the value of an unrelated item.
  const remainingByLine = new Map(lines.map((line) => [line.id, line.amount]));
  const appliedAdjustments: AppliedAdjustment[] = raw.map(({ rule, amount }) => {
    let applied = amount;
    if (amount < 0) {
      const scopedLines = rule.scope === "INVOICE"
        ? lines
        : lines.filter((line) => (rule.itemIds ?? []).includes(line.id));
      const capacities = scopedLines.map((line) => ({
        id: line.id,
        capacity: remainingByLine.get(line.id) ?? 0,
      }));
      const available = capacities.reduce((sum, line) => sum + line.capacity, 0);
      const discount = Math.min(Math.abs(amount), available);
      const allocations = capacities.map((line) => {
        const exact = available > 0 ? discount * line.capacity / available : 0;
        const allocated = Math.min(line.capacity, Math.floor(exact));
        return { ...line, allocated, fraction: exact - Math.floor(exact) };
      });
      let unallocated = discount - allocations.reduce((sum, line) => sum + line.allocated, 0);
      for (const line of [...allocations].sort((a, b) => b.fraction - a.fraction)) {
        if (unallocated <= 0) break;
        if (line.allocated < line.capacity) {
          line.allocated += 1;
          unallocated -= 1;
        }
      }
      for (const line of allocations) {
        remainingByLine.set(line.id, line.capacity - line.allocated);
      }
      applied = discount === 0 ? 0 : -discount;
    }
    return { id: rule.id, name: rule.name, percentage: rule.percentage, amount: applied, scope: rule.scope, ...(rule.scope === "ITEMS" ? { itemIds: [...(rule.itemIds ?? [])], itemIndexes: lines.flatMap((line, index) => (rule.itemIds ?? []).includes(line.id) ? [index] : []) } : {}) };
  });
  const adjustmentTotal = appliedAdjustments.reduce((sum, x) => sum + x.amount, 0);
  const adjustedSubtotal = Math.max(0, subtotal + adjustmentTotal);
  const enabledTaxes = taxes.filter((tax) => tax.enabled);
  if (enabledTaxes.length > 1 && enabledTaxes.some((tax) => !tax.allowWithOtherTaxes)) throw new Error("One or more selected taxes cannot be combined with other taxes");
  const appliedTaxes: AppliedTax[] = enabledTaxes.map((tax) => {
    if (!tax.id || !tax.name.trim()) throw new Error("Every tax requires an ID and name");
    if (!Number.isFinite(tax.value) || tax.value < 0 || (tax.kind === "PERCENTAGE" && tax.value > 1000)) throw new Error(`Tax "${tax.name}" has an invalid value`);
    const amount = tax.kind === "PERCENTAGE" ? roundNaira(adjustedSubtotal * tax.value / 100) : roundNaira(tax.value);
    return { id: tax.id, name: tax.name, kind: tax.kind, value: tax.value, treatment: tax.treatment, amount, allowWithOtherTaxes: tax.allowWithOtherTaxes };
  });
  const additiveTaxTotal = appliedTaxes.filter((x) => x.treatment === "ADDITIVE").reduce((sum, x) => sum + x.amount, 0);
  const withholdingTaxTotal = appliedTaxes.filter((x) => x.treatment === "WITHHOLDING").reduce((sum, x) => sum + x.amount, 0);
  return {
    subtotal, adjustedSubtotal, adjustmentTotal, taxableBase: adjustedSubtotal,
    additiveTaxTotal, withholdingTaxTotal,
    totalAmount: Math.max(0, adjustedSubtotal + additiveTaxTotal - withholdingTaxTotal),
    adjustments: appliedAdjustments, taxes: appliedTaxes,
  };
}

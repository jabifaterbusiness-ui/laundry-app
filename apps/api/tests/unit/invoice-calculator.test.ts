import { describe, expect, it } from "vitest";
import { calculateInvoice } from "../../src/modules/invoices/invoice-calculator.js";

describe("calculateInvoice", () => {
  const lines = [{ id: "shirt", amount: 10000 }, { id: "trouser", amount: 5000 }];
  it("calculates percentage adjustments independently against the original subtotal", () => {
    const result = calculateInvoice(lines, [
      { id: "a", name: "Member discount", percentage: -10, scope: "INVOICE" },
      { id: "b", name: "Peak surcharge", percentage: 5, scope: "INVOICE" },
    ]);
    expect(result.subtotal).toBe(15000);
    expect(result.adjustmentTotal).toBe(-750);
    expect(result.adjustedSubtotal).toBe(14250);
  });
  it("limits an item adjustment to selected items", () => {
    const result = calculateInvoice(lines, [{ id: "a", name: "Shirt discount", percentage: -20, scope: "ITEMS", itemIds: ["shirt"] }]);
    expect(result.adjustments[0].amount).toBe(-2000);
    expect(result.adjustments[0].itemIndexes).toEqual([0]);
    expect(result.totalAmount).toBe(13000);
  });
  it("supports a full discount and prevents a negative balance", () => {
    const result = calculateInvoice(lines, [{ id: "a", name: "Complimentary", percentage: -100, scope: "INVOICE" }]);
    expect(result.adjustedSubtotal).toBe(0);
    expect(result.totalAmount).toBe(0);
  });
  it("caps cumulative discounts at the original subtotal", () => {
    const result = calculateInvoice(lines, [
      { id: "a", name: "Full discount", percentage: -100, scope: "INVOICE" },
      { id: "b", name: "Extra discount", percentage: -50, scope: "INVOICE" },
    ]);
    expect(result.adjustedSubtotal).toBe(0);
    expect(result.totalAmount).toBe(0);
  });
  it("calculates additive and withholding taxes on the adjusted taxable base", () => {
    const result = calculateInvoice(lines, [{ id: "a", name: "Discount", percentage: -10, scope: "INVOICE" }], [
      { id: "vat", name: "VAT", kind: "PERCENTAGE", value: 7.5, treatment: "ADDITIVE", enabled: true, allowWithOtherTaxes: true },
      { id: "wht", name: "WHT", kind: "PERCENTAGE", value: 5, treatment: "WITHHOLDING", enabled: true, allowWithOtherTaxes: true },
      { id: "levy", name: "Fixed levy", kind: "FIXED", value: 200, treatment: "ADDITIVE", enabled: true, allowWithOtherTaxes: true },
    ]);
    expect(result.taxableBase).toBe(13500);
    expect(result.additiveTaxTotal).toBe(1213);
    expect(result.withholdingTaxTotal).toBe(675);
    expect(result.totalAmount).toBe(14038);
  });
  it("rejects tax combinations disallowed by a selected rule", () => {
    expect(() => calculateInvoice(lines, [], [
      { id: "a", name: "VAT", kind: "PERCENTAGE", value: 7.5, treatment: "ADDITIVE", enabled: true, allowWithOtherTaxes: false },
      { id: "b", name: "WHT", kind: "PERCENTAGE", value: 5, treatment: "WITHHOLDING", enabled: true, allowWithOtherTaxes: true },
    ])).toThrow(/cannot be combined/);
  });
  it("rejects empty item scopes and invalid percentages", () => {
    expect(() => calculateInvoice(lines, [{ id: "a", name: "Discount", percentage: -10, scope: "ITEMS", itemIds: [] }])).toThrow(/select at least one/);
    expect(() => calculateInvoice(lines, [{ id: "a", name: "Discount", percentage: -101, scope: "INVOICE" }])).toThrow(/between -100 and 1000/);
  });
});

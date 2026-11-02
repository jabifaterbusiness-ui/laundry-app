import { describe, expect, it } from "vitest";
import { buildInventoryReportCsv } from "../../src/lib/inventory-report-export.js";
import type { InventoryReport } from "../../src/lib/inventory-api.js";

const report: InventoryReport = {
  periodDays: 30,
  totalValuation: 125000,
  movementCount: 4,
  consumptionQuantity: 3,
  adjustmentQuantity: 1,
  movementTotals: { ISSUE: 3, ADJUSTMENT: 1 },
  valuation: [{
    inventoryItem: {
      id: "item-1",
      name: 'Detergent, "Premium"',
      sku: "=IMPORT(1)",
      category: "Cleaning",
      unit: "LITRE",
      lowStockThreshold: 2,
      reorderQuantity: 4,
      isActive: true,
      description: null,
      createdAt: "",
      updatedAt: "",
    },
    quantity: 10,
    reservedQuantity: 2,
    availableQuantity: 8,
    averageUnitCost: 2500,
    totalValue: 25000,
  }],
  supplierPerformance: [{
    supplierId: "supplier-1",
    supplierName: "Reliable Supplies",
    orderCount: 3,
    orderedValue: 100000,
    receivedOrderCount: 1,
    partiallyReceivedOrderCount: 1,
    openOrderCount: 1,
    averageFirstReceiptLeadTimeDays: 3,
  }],
};

describe("inventory report CSV export", () => {
  it("exports valuation, movement and supplier metrics with currency converted to naira", () => {
    const csv = buildInventoryReportCsv(report);
    expect(csv).toContain("Total stock valuation (NGN),1250");
    expect(csv).toContain("ISSUE,3");
    expect(csv).toContain('"Detergent, ""Premium"""');
    expect(csv).toContain("250,250");
    expect(csv).toContain("Reliable Supplies,3,1,1,1,3,1000");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("neutralizes spreadsheet formulas in user-controlled text", () => {
    const csv = buildInventoryReportCsv(report);
    expect(csv).toContain("'=IMPORT(1)");
    expect(csv).not.toContain("SKU\n=IMPORT(1)");
  });
});

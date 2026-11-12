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
  expiryRegister: [{
    id: "expiry-1",
    inventoryItem: { id: "item-1", name: "Detergent" } as InventoryReport["valuation"][number]["inventoryItem"],
    batchNumber: "LOT-1", expiryDate: "2026-11-20T00:00:00.000Z", quantityReceived: 5,
    receiptNumber: "GRN-1", receivedAt: "2026-11-01T00:00:00.000Z", daysUntilExpiry: 8, status: "DUE_SOON",
  }],
  valuation: [{
    inventoryItem: {
      id: "item-1",
      name: 'Detergent, "Premium"',
      sku: "=IMPORT(1)",
      category: "Cleaning",
      storageLocation: "Store room",
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
    expect(csv).toContain(",25,250");
    expect(csv).toContain("Reliable Supplies,3,1,1,1,3,1000");
    expect(csv).toContain("LOT-1,GRN-1,5,2026-11-20,8,DUE_SOON");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("neutralizes spreadsheet formulas in user-controlled text", () => {
    const csv = buildInventoryReportCsv(report);
    expect(csv).toContain("'=IMPORT(1)");
    expect(csv).not.toContain("SKU\n=IMPORT(1)");
  });

  it("neutralizes formulas preceded by tabs or whitespace", () => {
    const unsafeReport: InventoryReport = {
      ...report,
      valuation: [{
        ...report.valuation[0],
        inventoryItem: { ...report.valuation[0].inventoryItem, name: `${String.fromCharCode(9)}=HYPERLINK("https://bad.example")` },
      }],
    };
    expect(buildInventoryReportCsv(unsafeReport)).toContain(`'${String.fromCharCode(9)}=HYPERLINK`);
  });
});

import type { InventoryReport } from "./inventory-api.js";

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const raw = String(value);
  const safe = typeof value === "string" && /^\s*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csvRow(values: Array<string | number | null>): string {
  return values.map(csvCell).join(",");
}

export function buildInventoryReportCsv(report: InventoryReport): string {
  const rows = [
    csvRow(["Inventory report", `Last ${report.periodDays} days`]),
    csvRow(["Metric", "Value"]),
    csvRow(["Total stock valuation (NGN)", report.totalValuation / 100]),
    csvRow(["Movement count", report.movementCount]),
    csvRow(["Consumption quantity", report.consumptionQuantity]),
    csvRow(["Adjustment quantity", report.adjustmentQuantity]),
    "",
    csvRow(["Movement type", "Quantity"]),
    ...Object.entries(report.movementTotals).sort(([a], [b]) => a.localeCompare(b)).map(([type, quantity]) => csvRow([type, quantity])),
    "",
    csvRow(["Item", "SKU", "Category", "Unit", "On hand", "Reserved", "Available", "Average unit cost (NGN)", "Stock value (NGN)"]),
    ...report.valuation.map((row) => csvRow([
      row.inventoryItem.name,
      row.inventoryItem.sku ?? "",
      row.inventoryItem.category ?? "",
      row.inventoryItem.unit,
      row.quantity,
      row.reservedQuantity,
      row.availableQuantity,
      row.averageUnitCost / 100,
      row.totalValue / 100,
    ])),
    "",
    csvRow(["Supplier", "Orders", "Received", "Partially received", "Open", "Average first receipt lead time (days)", "Ordered value (NGN)"]),
    ...report.supplierPerformance.map((row) => csvRow([
      row.supplierName,
      row.orderCount,
      row.receivedOrderCount,
      row.partiallyReceivedOrderCount,
      row.openOrderCount,
      row.averageFirstReceiptLeadTimeDays,
      row.orderedValue / 100,
    ])),
  ];
  return `\uFEFF${rows.join("\r\n")}`;
}

export function downloadInventoryReportCsv(report: InventoryReport, fileName = "laundryangel-inventory-report.csv"): void {
  const blob = new Blob([buildInventoryReportCsv(report)], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

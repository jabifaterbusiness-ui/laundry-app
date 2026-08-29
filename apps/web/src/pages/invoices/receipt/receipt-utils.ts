import type { Invoice } from "@laundry-app/shared";

export function formatReceiptMoney(value: number): string {
  return `₦${value.toLocaleString("en-NG")}`;
}

export function formatReceiptDate(value: string): string {
  return new Date(value).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function getBusinessInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "LA";
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

export function getReceiptTitle(invoice: Invoice): string {
  return invoice.status === "VOID"
    ? "VOID INVOICE"
    : "LAUNDRY RECEIPT";
}

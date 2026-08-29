import { prisma } from "../../lib/prisma.js";

export type CustomerReceipt = {
  receiptType: "CUSTOMER";
  invoiceNumber: string;
  companyName: string;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  customerName: string;
  items: Array<{
    quantity: number;
    itemName: string;
    totalPieces: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  totalAmount: number;
  garmentNote: string | null;
  customerAgreement: string;
};

export type CompanyReceipt = {
  receiptType: "COMPANY";
  invoiceNumber: string;
  companyName: string;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  customerName: string;
  items: Array<{
    quantity: number;
    itemName: string;
    totalPieces: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  totalAmount: number;
  garmentNote: string | null;
  internalNote: string | null;
};

type InvoiceForReceipt = Awaited<
  ReturnType<typeof getInvoiceSnapshot>
>;

async function getInvoiceSnapshot(
  invoiceId: string,
  businessId: string,
  branchId: string,
) {
  return prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      businessId,
      branchId,
    },
    include: {
      items: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

function projectItems(invoice: NonNullable<InvoiceForReceipt>) {
  return invoice.items.map((item) => ({
    quantity: item.quantity,
    itemName: item.itemName,
    totalPieces: item.totalPieces,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
  }));
}

/**
 * Returns only customer-safe receipt data.
 *
 * IMPORTANT:
 * - internalNote is never included.
 * - customer phone/email/address are never included.
 * - Values come exclusively from the immutable Invoice snapshot.
 */
export async function getCustomerReceipt(
  invoiceId: string,
  businessId: string,
  branchId: string,
): Promise<CustomerReceipt | null> {
  const invoice = await getInvoiceSnapshot(
    invoiceId,
    businessId,
    branchId,
  );

  if (!invoice) {
    return null;
  }

  return {
    receiptType: "CUSTOMER",
    invoiceNumber: invoice.invoiceNumber,
    companyName: invoice.companyName,
    companyPhone: invoice.companyPhone,
    companyEmail: invoice.companyEmail,
    companyWebsite: invoice.companyWebsite,
    companyAddress: invoice.companyAddress,
    customerName: invoice.customerName,
    items: projectItems(invoice),
    totalAmount: invoice.totalAmount,
    garmentNote: invoice.garmentNote,
    customerAgreement: invoice.customerAgreement,
  };
}

/**
 * Returns the company/internal receipt projection.
 *
 * IMPORTANT:
 * - internalNote is available only here.
 * - customer contact information is never included.
 */
export async function getCompanyReceipt(
  invoiceId: string,
  businessId: string,
  branchId: string,
): Promise<CompanyReceipt | null> {
  const invoice = await getInvoiceSnapshot(
    invoiceId,
    businessId,
    branchId,
  );

  if (!invoice) {
    return null;
  }

  return {
    receiptType: "COMPANY",
    invoiceNumber: invoice.invoiceNumber,
    companyName: invoice.companyName,
    companyPhone: invoice.companyPhone,
    companyEmail: invoice.companyEmail,
    companyWebsite: invoice.companyWebsite,
    companyAddress: invoice.companyAddress,
    customerName: invoice.customerName,
    items: projectItems(invoice),
    totalAmount: invoice.totalAmount,
    garmentNote: invoice.garmentNote,
    internalNote: invoice.internalNote,
  };
}

import { prisma } from "../../lib/prisma.js";

export type CustomerReceipt = {
  receiptType: "CUSTOMER";
  invoiceNumber: string;
  orderNumber: string;
  companyName: string;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  logoUrl: string | null;
  receiptPrimaryColor: string | null;
  receiptAccentColor: string | null;
  receiptBackgroundColor: string | null;
  receiptTextColor: string | null;
  receiptHeaderStyle: string | null;
  customerName: string;
  branchName: string;
  createdAt: string;
  items: Array<{
    id: string;
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
  orderNumber: string;
  companyName: string;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  logoUrl: string | null;
  receiptPrimaryColor: string | null;
  receiptAccentColor: string | null;
  receiptBackgroundColor: string | null;
  receiptTextColor: string | null;
  receiptHeaderStyle: string | null;
  customerName: string;
  branchName: string;
  createdAt: string;
  items: Array<{
    id: string;
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
      order: {
        select: {
          orderNumber: true,
        },
      },
      branch: {
        select: {
          name: true,
        },
      },
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
    id: item.id,
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
    orderNumber: invoice.order.orderNumber,
    companyName: invoice.companyName,
    companyPhone: invoice.companyPhone,
    companyEmail: invoice.companyEmail,
    companyWebsite: invoice.companyWebsite,
    companyAddress: invoice.companyAddress,
    logoUrl: invoice.logoUrl,
    receiptPrimaryColor: invoice.receiptPrimaryColor,
    receiptAccentColor: invoice.receiptAccentColor,
    receiptBackgroundColor: invoice.receiptBackgroundColor,
    receiptTextColor: invoice.receiptTextColor,
    receiptHeaderStyle: invoice.receiptHeaderStyle,
    customerName: invoice.customerName,
    branchName: invoice.branch.name,
    createdAt: invoice.createdAt.toISOString(),
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
    orderNumber: invoice.order.orderNumber,
    companyName: invoice.companyName,
    companyPhone: invoice.companyPhone,
    companyEmail: invoice.companyEmail,
    companyWebsite: invoice.companyWebsite,
    companyAddress: invoice.companyAddress,
    logoUrl: invoice.logoUrl,
    receiptPrimaryColor: invoice.receiptPrimaryColor,
    receiptAccentColor: invoice.receiptAccentColor,
    receiptBackgroundColor: invoice.receiptBackgroundColor,
    receiptTextColor: invoice.receiptTextColor,
    receiptHeaderStyle: invoice.receiptHeaderStyle,
    customerName: invoice.customerName,
    branchName: invoice.branch.name,
    createdAt: invoice.createdAt.toISOString(),
    items: projectItems(invoice),
    totalAmount: invoice.totalAmount,
    garmentNote: invoice.garmentNote,
    internalNote: invoice.internalNote,
  };
}

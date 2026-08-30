import type { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export interface CreatePaymentData {
  businessId: string;
  branchId: string;
  invoiceId: string;
  amount: number;
  method: "CASH" | "TRANSFER" | "POS";
  reference?: string;
  note?: string;
}

export interface ListPaymentsParams {
  businessId: string;
  branchId: string;
  invoiceId?: string;
  status?: PaymentStatus;
  page: number;
  pageSize: number;
}

/**
 * Creates a payment against an invoice.
 *
 * Payment amount is checked against the invoice's currently outstanding
 * balance inside a transaction. Only POSTED payments count toward the
 * amount already paid.
 *
 * A customer may make multiple payments using different methods.
 * "Part payment" is therefore represented by an invoice having a
 * remaining balance, rather than being stored as a payment method.
 */
export async function createPayment(data: CreatePaymentData) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: {
        id: data.invoiceId,
        businessId: data.businessId,
        branchId: data.branchId,
      },
      include: {
        payments: {
          where: {
            status: "POSTED",
          },
          select: {
            amount: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new AppError("Invoice not found", 404);
    }

    if (invoice.status === "VOID") {
      throw new AppError(
        "Payments cannot be recorded against a void invoice",
        422,
      );
    }

    const amountPaid = invoice.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    const balance = invoice.totalAmount - amountPaid;

    if (balance <= 0) {
      throw new AppError(
        "This invoice has already been fully paid",
        422,
      );
    }

    if (data.amount > balance) {
      throw new AppError(
        `Payment amount cannot exceed the outstanding balance of ${balance}`,
        422,
      );
    }

    return tx.payment.create({
      data: {
        businessId: data.businessId,
        branchId: data.branchId,
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        ...(data.reference !== undefined && {
          reference: data.reference,
        }),
        ...(data.note !== undefined && {
          note: data.note,
        }),
      },
    });
  });
}

/**
 * Retrieves a single payment while enforcing tenant and branch isolation.
 */
export async function getPaymentForBranch(
  id: string,
  businessId: string,
  branchId: string,
) {
  return prisma.payment.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          orderId: true,
          totalAmount: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Lists payments within the authenticated business and branch.
 */
export async function listPayments(params: ListPaymentsParams) {
  const {
    businessId,
    branchId,
    invoiceId,
    status,
    page,
    pageSize,
  } = params;

  const where: Prisma.PaymentWhereInput = {
    businessId,
    branchId,
    ...(invoiceId ? { invoiceId } : {}),
    ...(status ? { status } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            orderId: true,
            totalAmount: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

/**
 * Returns the payment summary for one invoice.
 *
 * Only POSTED payments contribute to amountPaid and balance.
 */
export async function getInvoicePaymentSummary(
  invoiceId: string,
  businessId: string,
  branchId: string,
) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      businessId,
      branchId,
    },
    include: {
      payments: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!invoice) {
    throw new AppError("Invoice not found", 404);
  }

  const amountPaid = invoice.payments
    .filter((payment) => payment.status === "POSTED")
    .reduce((sum, payment) => sum + payment.amount, 0);

  const balance = Math.max(0, invoice.totalAmount - amountPaid);

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    totalAmount: invoice.totalAmount,
    amountPaid,
    balance,
    paymentStatus:
      balance === 0
        ? "PAID"
        : amountPaid > 0
          ? "PARTIALLY_PAID"
          : "UNPAID",
    payments: invoice.payments,
  };
}

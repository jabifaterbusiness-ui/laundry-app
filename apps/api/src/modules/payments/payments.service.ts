import type { PaymentStatus, PaymentType, Prisma } from "@prisma/client";
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
  type?: PaymentType;
  page: number;
  pageSize: number;
}

export interface RefundPaymentData {
  paymentId: string;
  businessId: string;
  branchId: string;
  amount: number;
  method: "CASH" | "TRANSFER" | "POS";
  reference?: string;
  note?: string;
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
            type: true,
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
      (sum, payment) =>
        sum + (payment.type === "REFUND" ? -payment.amount : payment.amount),
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
 * Voids a posted payment without deleting its historical record.
 *
 * Only payments within the authenticated business and branch can be
 * voided. A void payment cannot be voided again.
 *
 * Because invoice payment summaries count only POSTED payments, changing
 * the payment status to VOID automatically restores the amount to the
 * invoice's outstanding balance.
 */
export async function voidPayment(
  id: string,
  businessId: string,
  branchId: string,
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: {
        id,
        businessId,
        branchId,
      },
    });

    if (!payment) {
      throw new AppError("Payment not found", 404);
    }

    if (payment.status === "VOID") {
      throw new AppError("Payment is already void", 422);
    }

    return tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: "VOID",
      },
    });
  });
}


/**
 * Refunds a posted customer payment without modifying or deleting the
 * original payment record.
 *
 * A refund is stored as a separate REFUND ledger row linked to the
 * original PAYMENT. Multiple partial refunds are allowed, but the total
 * posted refund amount can never exceed the original payment amount.
 *
 * Business and branch isolation are enforced for both the original
 * payment and the invoice transaction.
 */
export async function refundPayment(data: RefundPaymentData) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: {
        id: data.paymentId,
        businessId: data.businessId,
        branchId: data.branchId,
      },
      include: {
        invoice: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!payment) {
      throw new AppError("Payment not found", 404);
    }

    if (payment.type !== "PAYMENT") {
      throw new AppError("Only an original payment can be refunded", 422);
    }

    if (payment.status === "VOID") {
      throw new AppError("A void payment cannot be refunded", 422);
    }

    if (data.amount <= 0) {
      throw new AppError("Refund amount must be greater than zero", 422);
    }

    if (payment.invoice.status === "VOID") {
      throw new AppError(
        "Payments cannot be refunded for a void invoice",
        422,
      );
    }

    const existingRefunds = await tx.payment.findMany({
      where: {
        businessId: data.businessId,
        branchId: data.branchId,
        refundOfPaymentId: payment.id,
        type: "REFUND",
        status: "POSTED",
      },
      select: {
        amount: true,
      },
    });

    const refundedAmount = existingRefunds.reduce(
      (sum, refund) => sum + refund.amount,
      0,
    );

    const refundableAmount = payment.amount - refundedAmount;

    if (refundableAmount <= 0) {
      throw new AppError("This payment has already been fully refunded", 422);
    }

    if (data.amount > refundableAmount) {
      throw new AppError(
        `Refund amount cannot exceed the remaining refundable amount of ${refundableAmount}`,
        422,
      );
    }

    return tx.payment.create({
      data: {
        businessId: data.businessId,
        branchId: data.branchId,
        invoiceId: payment.invoiceId,
        amount: data.amount,
        method: data.method,
        type: "REFUND",
        refundOfPaymentId: payment.id,
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
    type,
    page,
    pageSize,
  } = params;

  const where: Prisma.PaymentWhereInput = {
    businessId,
    branchId,
    ...(invoiceId ? { invoiceId } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
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
            customerName: true,
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
 * POSTED PAYMENT rows increase amountPaid, while POSTED REFUND rows
 * decrease it. VOID rows do not contribute.
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
    .reduce(
      (sum, payment) =>
        sum + (payment.type === "REFUND" ? -payment.amount : payment.amount),
      0,
    );

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

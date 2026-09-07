import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export interface ReconcileInvoiceInput {
  invoiceId: string;
  businessId: string;
  branchId: string;
}

export interface ReconciliationIssue {
  code:
    | "NEGATIVE_INVOICE_TOTAL"
    | "NON_POSITIVE_PAYMENT"
    | "NON_POSITIVE_REFUND"
    | "REFUND_WITHOUT_ORIGINAL"
    | "REFUND_TARGET_MISMATCH"
    | "REFUND_TARGET_NOT_PAYMENT"
    | "REFUND_TARGET_VOID"
    | "REFUND_EXCEEDS_ORIGINAL"
    | "PAYMENTS_EXCEED_INVOICE"
    | "VOID_INVOICE_HAS_POSTED_LEDGER";
  paymentId?: string;
  message: string;
}

export async function reconcileInvoice(
  input: ReconcileInvoiceInput,
) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: input.invoiceId,
      businessId: input.businessId,
      branchId: input.branchId,
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

  const issues: ReconciliationIssue[] = [];

  if (invoice.totalAmount < 0) {
    issues.push({
      code: "NEGATIVE_INVOICE_TOTAL",
      message: "Invoice total amount cannot be negative",
    });
  }

  const paymentsById = new Map(
    invoice.payments.map((payment) => [payment.id, payment]),
  );

  const postedPayments = invoice.payments.filter(
    (payment) => payment.status === "POSTED",
  );

  const postedRefunds = postedPayments.filter(
    (payment) => payment.type === "REFUND",
  );

  const postedOriginalPayments = postedPayments.filter(
    (payment) => payment.type === "PAYMENT",
  );

  for (const payment of invoice.payments) {
    if (payment.amount <= 0) {
      issues.push({
        code:
          payment.type === "REFUND"
            ? "NON_POSITIVE_REFUND"
            : "NON_POSITIVE_PAYMENT",
        paymentId: payment.id,
        message:
          payment.type === "REFUND"
            ? "Refund amount must be greater than zero"
            : "Payment amount must be greater than zero",
      });
    }

    if (payment.type === "REFUND") {
      if (!payment.refundOfPaymentId) {
        issues.push({
          code: "REFUND_WITHOUT_ORIGINAL",
          paymentId: payment.id,
          message: "Refund does not reference an original payment",
        });
        continue;
      }

      const original = paymentsById.get(payment.refundOfPaymentId);

      if (!original) {
        issues.push({
          code: "REFUND_WITHOUT_ORIGINAL",
          paymentId: payment.id,
          message: "Referenced original payment does not belong to this invoice",
        });
        continue;
      }

      if (original.type !== "PAYMENT") {
        issues.push({
          code: "REFUND_TARGET_NOT_PAYMENT",
          paymentId: payment.id,
          message: "Refund must reference an original PAYMENT row",
        });
      }

      if (original.status === "VOID") {
        issues.push({
          code: "REFUND_TARGET_VOID",
          paymentId: payment.id,
          message: "Refund references a void payment",
        });
      }

      if (
        original.businessId !== payment.businessId ||
        original.branchId !== payment.branchId ||
        original.invoiceId !== payment.invoiceId
      ) {
        issues.push({
          code: "REFUND_TARGET_MISMATCH",
          paymentId: payment.id,
          message:
            "Refund and original payment do not share the same business, branch and invoice scope",
        });
      }
    }
  }

  for (const payment of postedOriginalPayments) {
    const refundedAmount = postedRefunds
      .filter(
        (refund) => refund.refundOfPaymentId === payment.id,
      )
      .reduce((sum, refund) => sum + refund.amount, 0);

    if (refundedAmount > payment.amount) {
      issues.push({
        code: "REFUND_EXCEEDS_ORIGINAL",
        paymentId: payment.id,
        message: `Posted refunds of ${refundedAmount} exceed original payment amount of ${payment.amount}`,
      });
    }
  }

  const amountPaid = postedPayments.reduce(
    (sum, payment) =>
      sum + (payment.type === "REFUND" ? -payment.amount : payment.amount),
    0,
  );

  if (amountPaid > invoice.totalAmount) {
    issues.push({
      code: "PAYMENTS_EXCEED_INVOICE",
      message: `Posted ledger amount of ${amountPaid} exceeds invoice total of ${invoice.totalAmount}`,
    });
  }

  if (
    invoice.status === "VOID" &&
    postedPayments.length > 0
  ) {
    issues.push({
      code: "VOID_INVOICE_HAS_POSTED_LEDGER",
      message: "A void invoice has posted payment or refund ledger rows",
    });
  }

  const balance = Math.max(0, invoice.totalAmount - amountPaid);

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    totalAmount: invoice.totalAmount,
    amountPaid,
    balance,
    paymentStatus:
      balance === 0
        ? "PAID"
        : amountPaid > 0
          ? "PARTIALLY_PAID"
          : "UNPAID",
    paymentCount: invoice.payments.length,
    postedPaymentCount: postedPayments.length,
    issueCount: issues.length,
    reconciled: issues.length === 0,
    issues,
  };
}

import { AppError } from "../../middleware/error-handler.js";
import { prisma } from "../../lib/prisma.js";
import { getCustomerReceipt } from "./receipts.service.js";

export type ReceiptDeliveryChannel = "EMAIL" | "WHATSAPP";

export interface ResendReceiptInput {
  invoiceId: string;
  businessId: string;
  branchId: string;
  channel: ReceiptDeliveryChannel;
}

/**
 * Provider-neutral digital receipt delivery boundary.
 *
 * IMPORTANT:
 * - Receipt content comes exclusively from the immutable Invoice snapshot.
 * - Customer phone/email are delivery destinations only.
 * - Customer contact information is NEVER included in the receipt payload.
 * - Actual Email/WhatsApp providers must be connected behind this boundary.
 */
export async function resendDigitalReceipt(
  input: ResendReceiptInput,
) {
  const customer = await prisma.customer.findFirst({
    where: {
      businessId: input.businessId,
      orders: {
        some: {
          businessId: input.businessId,
          branchId: input.branchId,
          invoice: {
            id: input.invoiceId,
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
    },
  });

  if (!customer) {
    throw new AppError("Invoice not found", 404);
  }

  const receipt = await getCustomerReceipt(
    input.invoiceId,
    input.businessId,
    input.branchId,
  );

  if (!receipt) {
    throw new AppError("Invoice not found", 404);
  }

  const destination =
    input.channel === "EMAIL"
      ? customer.email
      : customer.phone;

  if (!destination) {
    throw new AppError(
      input.channel === "EMAIL"
        ? "Customer does not have an email address"
        : "Customer does not have a phone number",
      422,
    );
  }

  /*
   * No provider is currently configured in this application.
   *
   * Deliberately fail rather than reporting a false successful delivery.
   * The provider implementation will be connected behind this boundary.
   */
  throw new AppError(
    `${input.channel} receipt delivery is not configured`,
    503,
  );
}

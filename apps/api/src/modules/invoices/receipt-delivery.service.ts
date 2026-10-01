import { AppError } from "../../middleware/error-handler.js";
import { prisma } from "../../lib/prisma.js";
import { getCustomerReceipt } from "./receipts.service.js";
import { renderCustomerReceiptEmail } from "./templates/customer-receipt-email.js";
import { renderCustomerReceiptImage } from "./templates/customer-receipt-image.js";
import { sendReceiptEmail } from "./providers/resend.provider.js";
import { sendWhatsAppReceipt } from "./providers/whatsapp.provider.js";
import { assertWhatsAppMessagingEnabled } from "../platform/platform-controls.middleware.js";

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
 * - Delivery providers are connected behind this boundary.
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

  if (input.channel === "EMAIL") {
    const html = renderCustomerReceiptEmail(receipt);

    try {
      const delivery = await sendReceiptEmail({
        to: destination,
        subject: `${receipt.companyName} — Receipt ${receipt.invoiceNumber}`,
        html,
      });

      return {
        channel: input.channel,
        destination,
        providerMessageId: delivery.id,
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error
          ? error.message
          : "Email receipt delivery failed",
        503,
      );
    }
  }

  try {
    await assertWhatsAppMessagingEnabled();

    const image = await renderCustomerReceiptImage(receipt);

    const delivery = await sendWhatsAppReceipt({
      to: destination,
      image,
    });

    return {
      channel: input.channel,
      destination,
      providerMessageId: delivery.id,
    };
  } catch (error) {
    throw new AppError(
      error instanceof Error
        ? error.message
        : "WhatsApp receipt delivery failed",
      503,
    );
  }
}

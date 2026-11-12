import { AppError } from "../../middleware/error-handler.js";
import { prisma } from "../../lib/prisma.js";
import { getCustomerReceipt } from "./receipts.service.js";
import { renderCustomerReceiptEmail } from "./templates/customer-receipt-email.js";
import { renderCustomerReceiptImage } from "./templates/customer-receipt-image.js";
import { sendReceiptEmail } from "./providers/resend.provider.js";
import { sendWhatsAppReceipt } from "./providers/whatsapp.provider.js";
import { sendAutomatedWhatsAppTemplate, uploadWhatsAppTemplateImage } from "../whatsapp/whatsapp-templates.service.js";
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
      whatsappOptIn: true,
      whatsappOptInAt: true,
      whatsappOptInSource: true,
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

  if (
    input.channel === "WHATSAPP" &&
    (!customer.whatsappOptIn || !customer.whatsappOptInAt || !customer.whatsappOptInSource)
  ) {
    throw new AppError(
      "Customer has no complete recorded WhatsApp consent (source and timestamp). Record consent before sending this receipt.",
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

    try {
      const delivery = await sendWhatsAppReceipt({
        businessId: input.businessId,
        customerId: customer.id,
        to: destination,
        image,
      });

      return {
        channel: input.channel,
        destination,
        providerMessageId: delivery.id,
      };
    } catch (error) {
      const serviceWindowClosed = error instanceof Error &&
        error.message.includes("24-hour WhatsApp customer-service window is closed");
      if (!serviceWindowClosed) throw error;

      const connection = await prisma.whatsAppBusinessConnection.findUnique({
        where: { businessId: input.businessId },
        select: { receiptTemplateName: true, receiptTemplateLanguage: true },
      });
      if (!connection?.receiptTemplateName || !connection.receiptTemplateLanguage) {
        throw new AppError(
          "The 24-hour WhatsApp reply window is closed. Connect an approved UTILITY receipt template with an IMAGE header before sending this receipt.",
          422,
        );
      }

      const mediaId = await uploadWhatsAppTemplateImage(input.businessId, image);
      const templateDelivery = await sendAutomatedWhatsAppTemplate({
        businessId: input.businessId,
        customerId: customer.id,
        phone: destination,
        templateName: connection.receiptTemplateName,
        language: connection.receiptTemplateLanguage,
        templateCategory: "UTILITY",
        headerImageId: mediaId,
        variableValues: [
          receipt.customerName,
          receipt.invoiceNumber,
          `₦${receipt.totalAmount.toLocaleString("en-NG")}`,
          `₦${receipt.balanceDue.toLocaleString("en-NG")}`,
        ],
      });

      return {
        channel: input.channel,
        destination,
        providerMessageId: templateDelivery.providerMessageId,
      };
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      error instanceof Error
        ? error.message
        : "WhatsApp receipt delivery failed",
      503,
    );
  }
}

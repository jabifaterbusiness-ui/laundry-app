import { Resend } from "resend";
import { config } from "../../../config/index.js";

export interface SendHtmlEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendHtmlEmail(
  input: SendHtmlEmailInput,
): Promise<{ id: string }> {
  const { resendApiKey, emailFrom } = config.receiptDelivery;

  if (!resendApiKey || !emailFrom) {
    throw new Error("Resend email provider is not configured");
  }

  const resend = new Resend(resendApiKey);

  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (error) {
    throw new Error(`Resend email delivery failed: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("Resend email delivery returned no message ID");
  }

  return { id: data.id };
}

export interface SendReceiptEmailInput extends SendHtmlEmailInput {}

export async function sendReceiptEmail(
  input: SendReceiptEmailInput,
): Promise<{ id: string }> {
  return sendHtmlEmail(input);
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";
import { verifySubscriptionPayment } from "./subscription-payment-verification.service.js";

const PAYSTACK_PROVIDER_KEY = "paystack";
const PAYSTACK_SIGNATURE_HEADER = "x-paystack-signature";

type PaystackWebhookPayload = {
  event?: unknown;
  data?: Record<string, unknown>;
};

function getString(
  value: unknown,
  field: string,
  required = true,
): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (required) {
    throw new AppError(`Paystack webhook is missing ${field}`, 400);
  }

  return null;
}

function verifyPaystackSignature(rawBody: Buffer, signature: string) {
  const secretKey = config.paymentProviders.paystack.secretKey;

  if (!secretKey) {
    throw new AppError("Paystack is not configured on the server", 503);
  }

  const expected = createHmac("sha512", secretKey)
    .update(rawBody)
    .digest("hex");

  const receivedBuffer = Buffer.from(signature.trim(), "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw new AppError("Invalid Paystack webhook signature", 401);
  }
}

function getWebhookPayload(payload: unknown): PaystackWebhookPayload {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("event" in payload) ||
    typeof payload.event !== "string" ||
    !("data" in payload) ||
    typeof payload.data !== "object" ||
    payload.data === null
  ) {
    throw new AppError("Invalid Paystack webhook payload", 400);
  }

  return payload as PaystackWebhookPayload;
}

async function findOrCreateWebhookEvent(
  providerEventId: string,
  eventType: string,
  payload: Prisma.InputJsonValue,
) {
  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: {
      providerKey_providerEventId: {
        providerKey: PAYSTACK_PROVIDER_KEY,
        providerEventId,
      },
    },
  });

  if (existing) {
    return {
      event: existing,
      alreadyProcessed: existing.processed,
    };
  }

  try {
    const event = await prisma.paymentWebhookEvent.create({
      data: {
        providerKey: PAYSTACK_PROVIDER_KEY,
        providerEventId,
        eventType,
        payload,
      },
    });

    return {
      event,
      alreadyProcessed: false,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await prisma.paymentWebhookEvent.findUnique({
        where: {
          providerKey_providerEventId: {
            providerKey: PAYSTACK_PROVIDER_KEY,
            providerEventId,
          },
        },
      });

      if (concurrent) {
        return {
          event: concurrent,
          alreadyProcessed: concurrent.processed,
        };
      }
    }

    throw error;
  }
}

export async function processPaystackWebhook(
  rawBody: Buffer,
  signature: string | undefined,
) {
  if (!signature) {
    throw new AppError("Missing Paystack webhook signature", 401);
  }

  verifyPaystackSignature(rawBody, signature);

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AppError("Invalid Paystack webhook JSON", 400);
  }

  const webhook = getWebhookPayload(payload);
  const eventType = webhook.event as string;
  const data = webhook.data!;

  const providerEventId =
    typeof data.id === "string" && data.id.length > 0
      ? data.id
      : typeof data.id === "number" && Number.isFinite(data.id)
        ? String(data.id)
        : (() => {
            throw new AppError(
              "Paystack webhook is missing event transaction id",
              400,
            );
          })();

  const paymentReference = getString(
    data.reference,
    "payment reference",
    false,
  );

  const { event, alreadyProcessed } = await findOrCreateWebhookEvent(
    providerEventId!,
    eventType,
    payload as Prisma.InputJsonValue,
  );

  if (alreadyProcessed) {
    return {
      status: "already_processed" as const,
      eventId: event.id,
      eventType,
    };
  }

  if (eventType !== "charge.success") {
    const processed = await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });

    return {
      status: "ignored" as const,
      eventId: processed.id,
      eventType,
    };
  }

  if (!paymentReference) {
    throw new AppError(
      "Paystack charge.success webhook is missing a payment reference",
      400,
    );
  }

  const intent = await prisma.subscriptionPaymentIntent.findUnique({
    where: { paymentReference },
    select: {
      id: true,
      businessId: true,
      providerKey: true,
      origin: true,
    },
  });

  if (!intent) {
    const processed = await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });

    return {
      status: "ignored" as const,
      eventId: processed.id,
      eventType,
      paymentReference,
    };
  }

  if (intent.providerKey !== PAYSTACK_PROVIDER_KEY) {
    throw new AppError(
      "Paystack webhook does not match the payment intent provider",
      409,
    );
  }

  if (intent.origin !== "ONLINE") {
    throw new AppError(
      "Paystack webhook cannot process an offline payment intent",
      409,
    );
  }

  const result = await verifySubscriptionPayment(
    intent.businessId,
    intent.id,
    null,
    null,
  );

  const processed = await prisma.paymentWebhookEvent.update({
    where: { id: event.id },
    data: {
      businessId: intent.businessId,
      processed: true,
      processedAt: new Date(),
    },
  });

  return {
    status: result.alreadyProcessed
      ? ("already_processed" as const)
      : ("processed" as const),
    eventId: processed.id,
    eventType,
    paymentReference,
    paymentId: result.payment?.id ?? null,
    subscriptionId: result.subscription?.id ?? null,
  };
}

import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { processPaystackWebhook } from "./subscription-payment-webhook.service.js";

export const subscriptionPaymentWebhookRouter = Router();

subscriptionPaymentWebhookRouter.post(
  "/paystack",
  asyncHandler(async (req, res) => {
    const result = await processPaystackWebhook(
      req.rawBody ?? Buffer.alloc(0),
      req.header("x-paystack-signature"),
    );

    res.status(200).json(result);
  }),
);

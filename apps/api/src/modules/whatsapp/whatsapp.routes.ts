import { Router } from "express";
import { config } from "../../config/index.js";
import { processWhatsAppWebhook } from "./whatsapp-webhook.service.js";

export const whatsappRouter = Router();

whatsappRouter.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    config.receiptDelivery.whatsappVerifyToken &&
    token === config.receiptDelivery.whatsappVerifyToken &&
    typeof challenge === "string"
  ) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send("Forbidden");
});

whatsappRouter.post("/webhook", async (req, res, next) => {
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
  const signature = req.header("x-hub-signature-256");

  if (!rawBody) {
    return res.status(400).json({ error: "Missing webhook request body" });
  }

  try {
    const result = await processWhatsAppWebhook(rawBody, signature);
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    return next(error);
  }
});

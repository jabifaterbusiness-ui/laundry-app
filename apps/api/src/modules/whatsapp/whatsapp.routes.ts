import { Router } from "express";
import { config } from "../../config/index.js";

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

whatsappRouter.post("/webhook", (req, res) => {
  // Meta expects a successful response to webhook notifications.
  // Message/status processing can be added here without affecting
  // the existing WhatsApp receipt-delivery provider.
  return res.status(200).json({ received: true });
});

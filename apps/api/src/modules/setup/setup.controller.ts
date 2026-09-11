import type { Request, Response } from "express";
import { completeSetup, getSetupStatus } from "./setup.service.js";
import { setupSchema } from "./setup.validation.js";

export async function status(_req: Request, res: Response) {
  res.status(200).json(await getSetupStatus());
}

export async function setup(req: Request, res: Response) {
  const input = setupSchema.parse(req.body);
  res.status(201).json(await completeSetup(input));
}

import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { setup, status } from "./setup.controller.js";

export const setupRouter = Router();

setupRouter.get("/status", asyncHandler(status));
setupRouter.post("/", asyncHandler(setup));

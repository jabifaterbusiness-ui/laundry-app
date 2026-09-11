import { Router } from "express";
import { login, logout, me, refresh } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(login));
authRouter.post("/refresh", asyncHandler(refresh));
authRouter.post("/logout", asyncHandler(logout));
authRouter.get("/me", requireAuth, asyncHandler(me));

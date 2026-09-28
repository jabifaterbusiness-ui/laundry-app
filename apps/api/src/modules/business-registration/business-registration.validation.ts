import { z } from "zod";

export const businessRegistrationSchema = z
  .object({
    businessName: z.string().trim().min(1, "Business name is required").max(120),
    businessPhone: z.string().trim().max(40).optional().default(""),
    businessEmail: z
      .string()
      .trim()
      .email("Invalid business email address")
      .max(254)
      .optional()
      .or(z.literal("")),
    businessWebsite: z
      .string()
      .trim()
      .url("Invalid business website")
      .max(500)
      .optional()
      .or(z.literal("")),
    businessAddress: z.string().trim().max(500).optional().default(""),
    countryCode: z.string().trim().length(2).toUpperCase().default("NG"),
    currencyCode: z.string().trim().length(3).toUpperCase().default("NGN"),
    timezone: z.string().trim().min(1).max(100).default("Africa/Lagos"),
    locale: z.string().trim().min(2).max(20).default("en-NG"),
    ownerName: z.string().trim().min(1, "Owner full name is required").max(120),
    ownerEmail: z.string().trim().email("Invalid owner email address").max(254),
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters")
      .max(50)
      .regex(
        /^[a-zA-Z0-9._-]+$/,
        "Username may contain only letters, numbers, dots, underscores and hyphens",
      )
      .optional()
      .or(z.literal("")),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    branchName: z.string().trim().min(1, "Branch name is required").max(120),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type BusinessRegistrationInput = z.infer<
  typeof businessRegistrationSchema
>;

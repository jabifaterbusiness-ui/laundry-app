import { describe, expect, it } from "vitest";
import { createUserSchema, updateUserSchema } from "../../src/modules/users/users.validation.js";

describe("user phone validation", () => {
  const required = { fullName: "A Staff", email: "staff@example.com", password: "password123", role: "Staff", branchIds: [] };

  it("allows creation without a phone number", () => {
    expect(createUserSchema.safeParse(required).success).toBe(true);
  });

  it("accepts common formatted phone numbers and rejects malformed values", () => {
    expect(createUserSchema.safeParse({ ...required, phone: "+234 (801) 234-5678" }).success).toBe(true);
    expect(createUserSchema.safeParse({ ...required, phone: "letters-only" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...required, phone: "123456" }).success).toBe(false);
  });

  it("allows editing or clearing a phone number", () => {
    expect(updateUserSchema.safeParse({ phone: "080 1234 5678" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ phone: "" }).success).toBe(true);
  });
});

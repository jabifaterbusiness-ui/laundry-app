import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/modules/auth/auth.service.js";

describe("password hashing", () => {
  it("hashes a password and verifies it correctly", async () => {
    const plain = "correct-horse-battery-staple";
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    await expect(verifyPassword(hash, plain)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("the-real-password");
    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });
});

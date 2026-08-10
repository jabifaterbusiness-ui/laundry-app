import { describe, expect, it } from "vitest";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  normalizePhone,
  updateCustomerSchema,
} from "../../src/modules/customers/customers.validation.js";

describe("normalizePhone", () => {
  it("strips formatting but keeps a leading +", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("strips formatting with no leading +", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
  });
});

describe("createCustomerSchema", () => {
  const valid = { name: "Jane Doe", phone: "555-123-4567" };

  it("accepts a minimal valid payload", () => {
    expect(() => createCustomerSchema.parse(valid)).not.toThrow();
  });

  it("rejects an empty name", () => {
    expect(() => createCustomerSchema.parse({ ...valid, name: "" })).toThrow();
  });

  it("rejects a missing name", () => {
    expect(() => createCustomerSchema.parse({ phone: valid.phone })).toThrow();
  });

  it("rejects an invalid phone (too few digits)", () => {
    expect(() => createCustomerSchema.parse({ ...valid, phone: "123" })).toThrow();
  });

  it("rejects an invalid phone (letters)", () => {
    expect(() => createCustomerSchema.parse({ ...valid, phone: "call-me-maybe" })).toThrow();
  });

  it("rejects an invalid email", () => {
    expect(() => createCustomerSchema.parse({ ...valid, email: "not-an-email" })).toThrow();
  });

  it("accepts an omitted email", () => {
    expect(() => createCustomerSchema.parse(valid)).not.toThrow();
  });

  it("rejects an oversized name", () => {
    expect(() => createCustomerSchema.parse({ ...valid, name: "a".repeat(121) })).toThrow();
  });

  it("rejects oversized notes", () => {
    expect(() => createCustomerSchema.parse({ ...valid, notes: "a".repeat(2001) })).toThrow();
  });

  it("rejects an oversized address", () => {
    expect(() => createCustomerSchema.parse({ ...valid, address: "a".repeat(301) })).toThrow();
  });

  it("strips an unrecognized businessId field rather than accepting it", () => {
    const result = createCustomerSchema.parse({ ...valid, businessId: "attacker-supplied-id" });
    expect(result).not.toHaveProperty("businessId");
  });

  it("defaults confirmDuplicate to false", () => {
    const result = createCustomerSchema.parse(valid);
    expect(result.confirmDuplicate).toBe(false);
  });
});

describe("updateCustomerSchema", () => {
  it("rejects an empty patch", () => {
    expect(() => updateCustomerSchema.parse({})).toThrow();
  });

  it("accepts a single-field patch", () => {
    expect(() => updateCustomerSchema.parse({ notes: "called back" })).not.toThrow();
  });

  it("does not accept isActive - status changes go through activate/deactivate only", () => {
    const result = updateCustomerSchema.parse({ name: "New Name", isActive: false } as never);
    expect(result).not.toHaveProperty("isActive");
  });
});

describe("listCustomersQuerySchema", () => {
  it("applies defaults", () => {
    const result = listCustomersQuerySchema.parse({});
    expect(result).toEqual({ page: 1, pageSize: 25, status: "active" });
  });

  it("coerces page/pageSize from query strings", () => {
    const result = listCustomersQuerySchema.parse({ page: "2", pageSize: "10" });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  it("rejects a pageSize above the max", () => {
    expect(() => listCustomersQuerySchema.parse({ pageSize: "500" })).toThrow();
  });

  it("rejects an invalid status", () => {
    expect(() => listCustomersQuerySchema.parse({ status: "deleted" })).toThrow();
  });
});

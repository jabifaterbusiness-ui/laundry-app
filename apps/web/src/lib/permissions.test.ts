import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@laundry-app/shared";
import { hasPermission } from "./permissions.js";

function createUser(
  permissions: string[],
): AuthenticatedUser {
  return {
    id: "user-1",
    email: "user@example.com",
    fullName: "Test User",
    role: "STAFF",
    businessId: "business-1",
    branches: [],
    permissions,
  };
}

describe("hasPermission", () => {
  it("returns true when the user has the requested permission", () => {
    const user = createUser(["orders.view", "orders.create"]);

    expect(hasPermission(user, "orders.create")).toBe(true);
  });

  it("returns false when the user does not have the requested permission", () => {
    const user = createUser(["orders.view"]);

    expect(hasPermission(user, "orders.create")).toBe(false);
  });

  it("returns false when there is no authenticated user", () => {
    expect(hasPermission(null, "orders.view")).toBe(false);
  });

  it("does not infer permissions from the user's role", () => {
    const owner = {
      ...createUser([]),
      role: "BUSINESS_OWNER" as const,
    };

    expect(hasPermission(owner, "orders.create")).toBe(false);
  });
});

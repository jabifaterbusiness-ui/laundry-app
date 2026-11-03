import { describe, expect, it, vi } from "vitest";
import { resolveAutomaticDiscountSelections } from "../../src/modules/invoices/invoices.service.js";

function makeTransaction(rules: Array<Record<string, unknown>>) {
  const customerGroupMember = {
    findMany: vi.fn().mockResolvedValue([{ groupId: "group-1" }]),
  };
  const priceAdjustment = {
    findMany: vi.fn().mockResolvedValue(rules),
  };
  return {
    tx: { customerGroupMember, priceAdjustment } as never,
    customerGroupMember,
    priceAdjustment,
  };
}

describe("resolveAutomaticDiscountSelections", () => {
  it("selects individual/group/all-customer rules and excludes configured services", async () => {
    const { tx, customerGroupMember, priceAdjustment } = makeTransaction([
      {
        id: "group-discount",
        percentage: -15,
        targetScope: "GROUP",
        allowStacking: true,
        excludedServiceIds: [],
      },
      {
        id: "promotion",
        percentage: -5,
        targetScope: "ALL_CUSTOMERS",
        allowStacking: true,
        excludedServiceIds: ["service-2"],
      },
    ]);

    const result = await resolveAutomaticDiscountSelections(
      tx,
      "business-1",
      "customer-1",
      [{ serviceId: "service-1" }, { serviceId: "service-2" }],
      [],
    );

    expect(customerGroupMember.findMany).toHaveBeenCalledWith({
      where: { businessId: "business-1", customerId: "customer-1" },
      select: { groupId: true },
    });
    expect(priceAdjustment.findMany).toHaveBeenCalledOnce();
    expect(result).toEqual([
      { adjustmentId: "group-discount", scope: "INVOICE" },
      { adjustmentId: "promotion", scope: "ITEMS", itemIndexes: [0] },
    ]);
  });

  it("chooses the strongest eligible discount when stacking is not allowed", async () => {
    const { tx } = makeTransaction([
      {
        id: "small-discount",
        percentage: -5,
        targetScope: "ALL_CUSTOMERS",
        allowStacking: false,
        excludedServiceIds: [],
      },
      {
        id: "large-discount",
        percentage: -20,
        targetScope: "GROUP",
        allowStacking: true,
        excludedServiceIds: [],
      },
    ]);

    const result = await resolveAutomaticDiscountSelections(
      tx,
      "business-1",
      "customer-1",
      [{ serviceId: "service-1" }],
      [],
    );

    expect(result).toEqual([{ adjustmentId: "large-discount", scope: "INVOICE" }]);
  });

  it("does not stack a non-stackable automatic discount with a manually selected adjustment", async () => {
    const { tx } = makeTransaction([
      {
        id: "exclusive-discount",
        percentage: -10,
        targetScope: "CUSTOMER",
        allowStacking: false,
        excludedServiceIds: [],
      },
    ]);

    const result = await resolveAutomaticDiscountSelections(
      tx,
      "business-1",
      "customer-1",
      [{ serviceId: "service-1" }],
      [{ adjustmentId: "manual-adjustment", scope: "INVOICE" }],
    );

    expect(result).toEqual([]);
  });

  it("does not create an automatic selection when every service is excluded", async () => {
    const { tx } = makeTransaction([
      {
        id: "promotion",
        percentage: -10,
        targetScope: "ALL_CUSTOMERS",
        allowStacking: true,
        excludedServiceIds: ["service-1"],
      },
    ]);

    const result = await resolveAutomaticDiscountSelections(
      tx,
      "business-1",
      "customer-1",
      [{ serviceId: "service-1" }],
      [],
    );

    expect(result).toEqual([]);
  });
});

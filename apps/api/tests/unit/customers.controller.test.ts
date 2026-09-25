import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/modules/customers/customers.service.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/modules/customers/customers.service.js")>(
    "../../src/modules/customers/customers.service.js",
  );
  return {
    ...actual,
    createCustomer: vi.fn(),
    findPossibleDuplicates: vi.fn(),
    getCustomerForBusiness: vi.fn(),
    updateCustomer: vi.fn(),
    setCustomerLifecycleStatus: vi.fn(),
    listCustomers: vi.fn(),
  };
});

import { recordAuditEvent } from "../../src/lib/audit.js";
import * as service from "../../src/modules/customers/customers.service.js";
import { changeStatus, create, getOne, update } from "../../src/modules/customers/customers.controller.js";

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    correlationId: "corr-1",
    user: { id: "user-1", email: "a@example.com", role: "BUSINESS_OWNER", businessId: "biz-1" },
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("create - duplicate handling", () => {
  it("returns 409 with matches when a likely duplicate exists and confirmDuplicate is not set", async () => {
    vi.mocked(service.findPossibleDuplicates).mockResolvedValue([{ id: "existing-1", name: "Jane Doe", phone: "5551234567" }] as never);

    const req = makeReq({ body: { name: "Jane Doe", phone: "555-123-4567" } });
    const res = makeRes();

    await create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(service.createCustomer).not.toHaveBeenCalled();
  });

  it("creates anyway when confirmDuplicate is true, even with a match", async () => {
    vi.mocked(service.findPossibleDuplicates).mockResolvedValue([{ id: "existing-1", name: "Jane Doe", phone: "5551234567" }] as never);
    vi.mocked(service.createCustomer).mockResolvedValue({ id: "new-1", name: "Jane Doe" } as never);

    const req = makeReq({ body: { name: "Jane Doe", phone: "555-123-4567", confirmDuplicate: true } });
    const res = makeRes();

    await create(req, res);

    expect(service.createCustomer).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("creates directly with no duplicate lookup issue when none found", async () => {
    vi.mocked(service.findPossibleDuplicates).mockResolvedValue([]);
    vi.mocked(service.createCustomer).mockResolvedValue({ id: "new-1", name: "New Person" } as never);

    const req = makeReq({ body: { name: "New Person", phone: "555-999-0000" } });
    const res = makeRes();

    await create(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("create - security: businessId cannot be client-controlled", () => {
  it("always uses req.user.businessId, ignoring any businessId in the request body", async () => {
    vi.mocked(service.findPossibleDuplicates).mockResolvedValue([]);
    vi.mocked(service.createCustomer).mockResolvedValue({ id: "new-1" } as never);

    const req = makeReq({
      body: { name: "Jane", phone: "555-123-4567", businessId: "attacker-business-id" },
      user: {
        id: "user-1",
        email: "a@example.com",
        role: "BUSINESS_OWNER",
        securityRole: "BUSINESS_OWNER",
        businessId: "real-biz-id",
      },
    });

    await create(req, makeRes());

    expect(service.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ businessId: "real-biz-id" }));
    expect(service.findPossibleDuplicates).toHaveBeenCalledWith("real-biz-id", expect.any(String));
  });
});

describe("getOne - cross-business access", () => {
  it("returns 404 (not a leaked existence signal) when the customer is not in the caller's business", async () => {
    vi.mocked(service.getCustomerForBusiness).mockResolvedValue(null);

    const req = makeReq({ params: { id: "11111111-1111-1111-1111-111111111111" } });

    await expect(getOne(req, makeRes())).rejects.toThrow("Customer not found");
  });
});

describe("update - audit metadata", () => {
  it("records only the changed field names, never full customer data", async () => {
    vi.mocked(service.updateCustomer).mockResolvedValue({ id: "cust-1", name: "Updated" } as never);

    const req = makeReq({ params: { id: "11111111-1111-1111-1111-111111111111" }, body: { name: "Updated" } });
    await update(req, makeRes());

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer.updated", metadata: { fields: ["name"] } }),
    );
  });
});

describe("update - duplicate phone handling", () => {
  const id = "11111111-1111-1111-1111-111111111111";

  it("returns 409 with matches and does not update when the new phone matches another active customer", async () => {
    vi.mocked(service.findPossibleDuplicates).mockResolvedValue([{ id: "other-1", name: "Jane Doe", phone: "5551234567" }] as never);

    const req = makeReq({ params: { id }, body: { phone: "555-123-4567" } });
    const res = makeRes();

    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(service.updateCustomer).not.toHaveBeenCalled();
  });

  it("excludes the customer being updated from the duplicate search", async () => {
    vi.mocked(service.findPossibleDuplicates).mockResolvedValue([]);
    vi.mocked(service.updateCustomer).mockResolvedValue({ id, phone: "5551234567" } as never);

    const req = makeReq({ params: { id }, body: { phone: "555-123-4567" } });
    await update(req, makeRes());

    expect(service.findPossibleDuplicates).toHaveBeenCalledWith("biz-1", "5551234567", id);
  });

  it("does not run the duplicate check when phone is not part of the update", async () => {
    vi.mocked(service.updateCustomer).mockResolvedValue({ id, name: "New Name" } as never);

    const req = makeReq({ params: { id }, body: { name: "New Name" } });
    await update(req, makeRes());

    expect(service.findPossibleDuplicates).not.toHaveBeenCalled();
    expect(service.updateCustomer).toHaveBeenCalledOnce();
  });

  it("allows the update when confirmDuplicate is true, even with a match", async () => {
    vi.mocked(service.findPossibleDuplicates).mockResolvedValue([{ id: "other-1", name: "Jane Doe", phone: "5551234567" }] as never);
    vi.mocked(service.updateCustomer).mockResolvedValue({ id, phone: "5551234567" } as never);

    const req = makeReq({ params: { id }, body: { phone: "555-123-4567", confirmDuplicate: true } });
    const res = makeRes();

    await update(req, res);

    expect(service.updateCustomer).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("writes no audit event when the update is blocked by the duplicate check", async () => {
    vi.mocked(service.findPossibleDuplicates).mockResolvedValue([{ id: "other-1", name: "Jane Doe", phone: "5551234567" }] as never);

    const req = makeReq({ params: { id }, body: { phone: "555-123-4567" } });
    await update(req, makeRes());

    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("writes customer.updated after a confirmed duplicate update succeeds, without confirmDuplicate in metadata", async () => {
    vi.mocked(service.findPossibleDuplicates).mockResolvedValue([{ id: "other-1", name: "Jane Doe", phone: "5551234567" }] as never);
    vi.mocked(service.updateCustomer).mockResolvedValue({ id, phone: "5551234567" } as never);

    const req = makeReq({ params: { id }, body: { phone: "555-123-4567", confirmDuplicate: true } });
    await update(req, makeRes());

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer.updated", metadata: { fields: ["phone"] } }),
    );
  });
});

describe("changeStatus - lifecycle status and audit metadata", () => {
  it("records previous status, new status, reason, and actor", async () => {
    vi.mocked(service.setCustomerLifecycleStatus).mockResolvedValue({
      customer: { id: "cust-1", lifecycleStatus: "BLOCKED" },
      previousStatus: "ACTIVE",
    } as never);

    const req = makeReq({
      params: { id: "11111111-1111-1111-1111-111111111111" },
      body: {
        status: "BLOCKED",
        reason: "Repeated failed collection attempts",
      },
    });

    await changeStatus(req, makeRes());

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "customer.status_changed",
        metadata: {
          previousStatus: "ACTIVE",
          newStatus: "BLOCKED",
          reason: "Repeated failed collection attempts",
        },
      }),
    );
  });
});

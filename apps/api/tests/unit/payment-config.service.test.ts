import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    paymentProviderConfig: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    paymentMethodConfig: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  auditMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: auditMock,
}));

import {
  listPaymentProviders,
  upsertPaymentProvider,
  setPaymentProviderActive,
  removePaymentProvider,
  listPaymentMethods,
  upsertPaymentMethod,
  setPaymentMethodActive,
  removePaymentMethod,
  validatePaymentSelection,
} from "../../src/modules/platform/payment-config.service.js";

describe("payment configuration service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists providers in configured order", async () => {
    const providers = [{ providerKey: "paystack" }, { providerKey: "flutterwave" }];
    prismaMock.paymentProviderConfig.findMany.mockResolvedValue(providers);

    await expect(listPaymentProviders()).resolves.toEqual(providers);
  });

  it("upserts and audits a provider", async () => {
    const provider = {
      id: "provider-1",
      providerKey: "paystack",
      displayName: "Paystack",
      enabled: true,
      supportedCountries: ["NG"],
      supportedCurrencies: ["NGN"],
      supportedMethods: ["CARD", "BANK_TRANSFER"],
      displayOrder: 1,
    };

    prismaMock.paymentProviderConfig.upsert.mockResolvedValue(provider);

    await expect(
      upsertPaymentProvider(
        {
          providerKey: " paystack ",
          displayName: "Paystack",
          enabled: true,
          supportedCountries: ["ng"],
          supportedCurrencies: ["ngn"],
          supportedMethods: ["CARD", "BANK_TRANSFER"],
          displayOrder: 1,
        },
        "admin-1",
        "corr-1",
      ),
    ).resolves.toEqual(provider);

    expect(prismaMock.paymentProviderConfig.upsert).toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment.provider.updated",
        actorUserId: "admin-1",
        correlationId: "corr-1",
      }),
    );
  });

  it("does not remove a provider while methods are linked", async () => {
    prismaMock.paymentProviderConfig.findFirst.mockResolvedValue({
      id: "provider-1",
      providerKey: "paystack",
      displayName: "Paystack",
    });
    prismaMock.paymentMethodConfig.count.mockResolvedValue(1);

    await expect(
      removePaymentProvider("provider-1", "admin-1"),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.paymentProviderConfig.delete).not.toHaveBeenCalled();
  });

  it("allows removing an unused provider", async () => {
    const provider = {
      id: "provider-1",
      providerKey: "paystack",
      displayName: "Paystack",
    };

    prismaMock.paymentProviderConfig.findFirst.mockResolvedValue(provider);
    prismaMock.paymentMethodConfig.count.mockResolvedValue(0);
    prismaMock.paymentProviderConfig.delete.mockResolvedValue(provider);

    await expect(
      removePaymentProvider("provider-1", "admin-1"),
    ).resolves.toEqual({ id: "provider-1", removed: true });
  });

  it("requires an existing provider when linking a payment method", async () => {
    prismaMock.paymentProviderConfig.findFirst.mockResolvedValue(null);

    await expect(
      upsertPaymentMethod(
        {
          methodKey: "CARD",
          displayName: "Card",
          providerKey: "missing-provider",
          supportedCountries: ["NG"],
          supportedCurrencies: ["NGN"],
        },
        "admin-1",
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prismaMock.paymentMethodConfig.upsert).not.toHaveBeenCalled();
  });

  it("upserts a payment method", async () => {
    const method = {
      id: "method-1",
      methodKey: "CARD",
      displayName: "Card",
      providerKey: "paystack",
      enabled: true,
    };

    prismaMock.paymentProviderConfig.findFirst.mockResolvedValue({
      id: "provider-1",
      providerKey: "paystack",
    });
    prismaMock.paymentMethodConfig.upsert.mockResolvedValue(method);

    await expect(
      upsertPaymentMethod(
        {
          methodKey: "CARD",
          displayName: "Card",
          providerKey: "paystack",
          enabled: true,
          supportedCountries: ["ng"],
          supportedCurrencies: ["ngn"],
        },
        "admin-1",
      ),
    ).resolves.toEqual(method);

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment.method.updated",
      }),
    );
  });

  it("updates provider status", async () => {
    prismaMock.paymentProviderConfig.findFirst.mockResolvedValue({
      id: "provider-1",
      enabled: false,
    });
    prismaMock.paymentProviderConfig.update.mockResolvedValue({
      id: "provider-1",
      enabled: true,
    });

    await expect(
      setPaymentProviderActive("provider-1", true, "admin-1"),
    ).resolves.toEqual({
      id: "provider-1",
      enabled: true,
    });
  });

  it("updates payment method status", async () => {
    prismaMock.paymentMethodConfig.findFirst.mockResolvedValue({
      id: "method-1",
      methodKey: "CARD",
      enabled: false,
    });
    prismaMock.paymentMethodConfig.update.mockResolvedValue({
      id: "method-1",
      enabled: true,
    });

    await expect(
      setPaymentMethodActive("method-1", true, "admin-1"),
    ).resolves.toEqual({
      id: "method-1",
      enabled: true,
    });
  });

  it("removes a payment method", async () => {
    const method = {
      id: "method-1",
      methodKey: "CARD",
      displayName: "Card",
      providerKey: "paystack",
    };

    prismaMock.paymentMethodConfig.findFirst.mockResolvedValue(method);
    prismaMock.paymentMethodConfig.delete.mockResolvedValue(method);

    await expect(
      removePaymentMethod("method-1", "admin-1"),
    ).resolves.toEqual({ id: "method-1", removed: true });

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment.method.removed",
      }),
    );
  });

  it("lists payment methods", async () => {
    const methods = [{ methodKey: "CARD" }];
    prismaMock.paymentMethodConfig.findMany.mockResolvedValue(methods);

    await expect(listPaymentMethods()).resolves.toEqual(methods);
  });
  it("accepts an enabled provider and method that support the business", async () => {
    prismaMock.paymentProviderConfig.findFirst.mockResolvedValue({
      id: "provider-1",
      providerKey: "paystack",
      enabled: true,
      supportedCountries: ["NG"],
      supportedCurrencies: ["NGN"],
      supportedMethods: ["CARD"],
    });
    prismaMock.paymentMethodConfig.findFirst.mockResolvedValue({
      id: "method-1",
      methodKey: "CARD",
      providerKey: "paystack",
      enabled: true,
      supportedCountries: ["NG"],
      supportedCurrencies: ["NGN"],
    });

    await expect(
      validatePaymentSelection("ng", "ngn", "paystack", "CARD"),
    ).resolves.toMatchObject({
      provider: { providerKey: "paystack" },
      method: { methodKey: "CARD" },
    });
  });

  it("rejects a disabled or unavailable provider", async () => {
    prismaMock.paymentProviderConfig.findFirst.mockResolvedValue(null);
    prismaMock.paymentMethodConfig.findFirst.mockResolvedValue({
      id: "method-1",
      methodKey: "CARD",
      enabled: true,
      supportedCountries: ["NG"],
      supportedCurrencies: ["NGN"],
    });

    await expect(
      validatePaymentSelection("NG", "NGN", "paystack", "CARD"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a provider-method mismatch", async () => {
    prismaMock.paymentProviderConfig.findFirst.mockResolvedValue({
      id: "provider-1",
      providerKey: "flutterwave",
      enabled: true,
      supportedCountries: ["NG"],
      supportedCurrencies: ["NGN"],
      supportedMethods: ["CARD"],
    });
    prismaMock.paymentMethodConfig.findFirst.mockResolvedValue({
      id: "method-1",
      methodKey: "CARD",
      providerKey: "paystack",
      enabled: true,
      supportedCountries: ["NG"],
      supportedCurrencies: ["NGN"],
    });

    await expect(
      validatePaymentSelection("NG", "NGN", "flutterwave", "CARD"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

});

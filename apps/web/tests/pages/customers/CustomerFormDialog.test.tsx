import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Customer } from "@laundry-app/shared";
import type { CreateCustomerInput } from "../../../src/lib/customers-api.js";
import { CustomerFormDialog } from "../../../src/pages/customers/CustomerFormDialog.js";

function optedInCustomer() {
  return {
    id: "customer-1",
    name: "Ada",
    phone: "08012345678",
    email: null,
    address: null,
    notes: null,
    whatsappOptIn: true,
    whatsappOptInSource: "CUSTOMER_WRITTEN",
  } as unknown as Customer;
}

describe("CustomerFormDialog WhatsApp consent", () => {
  it("requires fresh consent when the customer's phone number changes", async () => {
    const onSubmit = vi.fn(async (_input: CreateCustomerInput) => undefined);
    render(
      <CustomerFormDialog
        customer={optedInCustomer()}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const consent = screen.getByRole("checkbox", {
      name: /customer has explicitly agreed to receive whatsapp messages/i,
    });
    expect(consent).toBeChecked();

    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "08099998888" },
    });
    expect(consent).not.toBeChecked();
    expect(screen.queryByLabelText("How did the customer give consent?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ phone: "08099998888", whatsappOptIn: false });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("whatsappOptInSource");
  });

  it("preserves consent when only phone-number formatting changes", () => {
    render(
      <CustomerFormDialog
        customer={optedInCustomer()}
        onCancel={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const consent = screen.getByRole("checkbox", {
      name: /customer has explicitly agreed to receive whatsapp messages/i,
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "080 123 45678" },
    });

    expect(consent).toBeChecked();
  });
});

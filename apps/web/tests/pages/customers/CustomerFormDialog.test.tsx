import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Customer } from "@laundry-app/shared";
import { DuplicateCustomerError, type CreateCustomerInput } from "../../../src/lib/customers-api.js";
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

function optedOutCustomer() {
  return {
    ...optedInCustomer(),
    whatsappOptIn: false,
  } as unknown as Customer;
}

describe("CustomerFormDialog duplicate protection", () => {
  it("shows possible duplicate accounts and requires explicit confirmation before creating anyway", async () => {
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(new DuplicateCustomerError(
        "A customer with this phone number may already exist.",
        [{ id: "existing-customer", name: "Existing Ada", phone: "08012345678" }],
      ))
      .mockResolvedValueOnce(undefined);

    render(
      <CustomerFormDialog
        customer={null}
        initialPhone="08012345678"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Existing Ada (08012345678)");
    expect(onSubmit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      phone: "08012345678",
      confirmDuplicate: false,
    }));

    fireEvent.click(screen.getByRole("button", { name: "Create anyway" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      phone: "08012345678",
      confirmDuplicate: true,
    }));
  });
});

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
    const submitted = onSubmit.mock.calls[0]?.[0];
    expect(submitted).toMatchObject({ phone: "08099998888", whatsappOptIn: false });
    expect(submitted).not.toHaveProperty("whatsappOptInSource");
  });

  it("requires a newly selected consent source before opting in the changed number", async () => {
    const onSubmit = vi.fn(async (_input: CreateCustomerInput) => undefined);
    render(
      <CustomerFormDialog
        customer={optedInCustomer()}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "08099998888" },
    });
    const consent = screen.getByRole("checkbox", {
      name: /customer has explicitly agreed to receive whatsapp messages/i,
    });
    fireEvent.click(consent);

    const source = screen.getByLabelText("How did the customer give consent?");
    expect(source).toHaveValue("");
    expect(source).toBeRequired();

    fireEvent.change(source, { target: { value: "CUSTOMER_WRITTEN" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      phone: "08099998888",
      whatsappOptIn: true,
      whatsappOptInSource: "CUSTOMER_WRITTEN",
    });
  });

  it("requires a fresh consent source when a previously opted-out customer opts in again", () => {
    render(
      <CustomerFormDialog
        customer={optedOutCustomer()}
        onCancel={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const consent = screen.getByRole("checkbox", {
      name: /customer has explicitly agreed to receive whatsapp messages/i,
    });
    expect(consent).not.toBeChecked();
    fireEvent.click(consent);
    expect(consent).toBeChecked();

    const source = screen.getByLabelText("How did the customer give consent?");
    expect(source).toHaveValue("");
    expect(source).toBeRequired();
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

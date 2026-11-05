import { useState, type FormEvent } from "react";
import type { Customer } from "@laundry-app/shared";
import { ApiError } from "../../lib/api-client.js";
import { DuplicateCustomerError, type CreateCustomerInput } from "../../lib/customers-api.js";

interface Props {
  customer: Customer | null;
  onCancel: () => void;
  onSubmit: (input: CreateCustomerInput) => Promise<void>;
  initialPhone?: string;
}

export function CustomerFormDialog({ customer, onCancel, onSubmit, initialPhone }: Props) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? initialPhone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [whatsappOptIn, setWhatsappOptIn] = useState(customer?.whatsappOptIn ?? false);
  const [whatsappOptInSource, setWhatsappOptInSource] = useState<CreateCustomerInput["whatsappOptInSource"]>(customer?.whatsappOptInSource as CreateCustomerInput["whatsappOptInSource"] ?? "CUSTOMER_VERBAL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Pick<Customer, "id" | "name" | "phone">[] | null>(null);

  async function submit(confirmDuplicate: boolean) {
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        name,
        phone,
        email: email || undefined,
        address: address || undefined,
        notes: notes || undefined,
        whatsappOptIn,
        ...(whatsappOptIn ? { whatsappOptInSource } : {}),
        confirmDuplicate,
      });
    } catch (err) {
      if (err instanceof DuplicateCustomerError) {
        setDuplicates(err.duplicates);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setDuplicates(null);
    void submit(false);
  }

  return (
    <div role="dialog" aria-label={customer ? "Edit customer" : "New customer"}>
      <h2>{customer ? "Edit customer" : "New customer"}</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </label>
        <label>
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="(555) 123-4567" />
        </label>
        <label>
          Email (optional)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Address (optional)
          <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
        </label>
        <label>
          Notes (optional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </label>
        <fieldset style={{ border: "1px solid #dbe3ee", borderRadius: 10, padding: 12, marginTop: 12 }}>
          <legend>WhatsApp message consent</legend>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} />
            <span>Customer has explicitly agreed to receive WhatsApp messages from this business, including order updates and receipts.</span>
          </label>
          {whatsappOptIn && (
            <label>
              How did the customer give consent?
              <select value={whatsappOptInSource} onChange={(e) => setWhatsappOptInSource(e.target.value as NonNullable<CreateCustomerInput["whatsappOptInSource"]>)}>
                <option value="CUSTOMER_VERBAL">Verbal agreement</option>
                <option value="CUSTOMER_WRITTEN">Written agreement</option>
                <option value="CUSTOMER_WEBSITE">Website / online form</option>
                <option value="CUSTOMER_OTHER">Other documented method</option>
              </select>
            </label>
          )}
          <small>Leave unchecked unless the customer has clearly agreed. Existing customers are not opted in automatically.</small>
        </fieldset>

        {error && <p role="alert">{error}</p>}

        {duplicates && duplicates.length > 0 && (
          <div role="alert">
            <p>This phone number looks like it belongs to an existing customer:</p>
            <ul>
              {duplicates.map((d) => (
                <li key={d.id}>
                  {d.name} ({d.phone})
                </li>
              ))}
            </ul>
            {/* Never auto-merges or overwrites - staff explicitly choose
                to proceed (a second, genuinely distinct customer can
                share a phone number) or go back and change it. */}
            <button type="button" disabled={isSubmitting} onClick={() => void submit(true)}>
              {customer ? "Save anyway" : "Create anyway"}
            </button>
            <button type="button" disabled={isSubmitting} onClick={() => setDuplicates(null)}>
              Back to editing
            </button>
          </div>
        )}

        <div>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

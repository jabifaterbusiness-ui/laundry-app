import { useState, type FormEvent } from "react";
import type { Customer } from "@laundry-app/shared";
import { ApiError } from "../../lib/api-client.js";
import { DuplicateCustomerError, type CreateCustomerInput } from "../../lib/customers-api.js";

interface Props {
  customer: Customer | null;
  onCancel: () => void;
  onSubmit: (input: CreateCustomerInput) => Promise<void>;
}

export function CustomerFormDialog({ customer, onCancel, onSubmit }: Props) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
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

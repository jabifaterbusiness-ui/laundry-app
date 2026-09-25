# Invoices Module

The invoices module creates and retrieves immutable historical invoice
snapshots from existing orders.

## Receipt data rules

Customer and company receipts use the same invoice snapshot but different
projections:

- Customer copy:
  - company name/contact information/address
  - invoice/order number
  - customer name
  - QTY
  - Item
  - PCS
  - Unit Price
  - Total Price
  - total amount
  - customer-visible garment note
  - customer agreement
- Company copy:
  - all operational invoice information
  - private internal note
  - no customer agreement requirement
  - no customer phone/email/address

Customer contact information is deliberately not stored on Invoice and is
not printed on either receipt.

Invoice prices, quantities, pieces and totals are always copied from the
server-side OrderItem snapshot. Clients cannot supply these financial values.

## Immutability and historical preservation

Invoices are immutable historical transaction records.

- The module exposes invoice creation and read/receipt operations only.
- There is intentionally no invoice update or delete endpoint.
- Customer, company, branding, agreement, totals, notes, and invoice-item values are snapshotted when the invoice is created.
- `InvoiceItem` rows are historical snapshots of the order items used to create the invoice.
- An invoice cannot be recreated for an order that already has an invoice.
- Invoice status is `ISSUED` or `VOID`; voiding a transaction must not delete the historical invoice record.
- Changes to the customer, business, branding, or order after invoice creation must not rewrite the historical invoice snapshot.
- Any future invoice correction workflow must preserve the original invoice rather than overwriting or deleting it.

This contract is intentionally implemented without a separate invoice-history/version table because the current invoice itself is the immutable historical record and the application provides no destructive invoice mutation path.

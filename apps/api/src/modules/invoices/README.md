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

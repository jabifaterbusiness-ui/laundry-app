# payments module

Status: API foundation implemented.

Payment methods:
- CASH
- TRANSFER
- POS

Part payment is not a separate payment method. It is represented by one or
more posted payments whose combined amount is less than the invoice total.

Payment rules:
- Payments are tenant- and branch-scoped.
- Payments may only be made against an ISSUED invoice.
- Posted payments cannot exceed the outstanding invoice balance.
- Multiple payments are allowed against one invoice.
- VOID payments do not contribute to the amount paid.
- Payment records are retained for historical/audit purposes.

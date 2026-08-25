# Garments module

The Garments module tracks individual physical garment pieces belonging to
OrderItems.

Each garment is tenant-scoped by `businessId` and branch-scoped by
`branchId`. Garments are generated server-side from the OrderItem's
`totalPieces`; clients cannot submit prices, totals, business IDs, or
arbitrary garment counts.

Garment lifecycle:

- RECEIVED
- PROCESSING
- READY
- PICKED_UP
- DAMAGED
- LOST

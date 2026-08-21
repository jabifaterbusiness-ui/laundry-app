# Backup, Restore & Legacy Data Migration

## Commercial requirement

The product is designed for multiple independent laundry businesses. Data migration is a first-class capability, not a one-off importer for a single legacy product.

The migration layer is intentionally adapter-based:

- DBF / Visual FoxPro-style backups
- ZIP archives containing DBF/CSV/JSON/XLSX files
- CSV
- JSON
- XLSX/XLS
- Versioned encrypted Laundry App backups

New source systems should be added as adapters without changing tenant isolation or business-domain services.

## Security rules

1. Every migration job is scoped to the authenticated `businessId`.
2. The client never supplies a business ID for authorization.
3. Uploaded legacy source files are encrypted at rest using the migration storage key.
4. ZIP path traversal is rejected.
5. ZIP file-count and decompressed-size limits are enforced.
6. Migration previews are required before import.
7. Imports never delete existing records.
8. Customer duplicate handling is explicit: skip, merge missing information, or create a separate record.
9. Migration and backup actions are audited.
10. Application backup files are encrypted with AES-256-GCM using a password-derived key.
11. Current staff credentials are not overwritten during a merge restore.

## Current v1 scope

The current business schema contains the Customer module, so the first migration adapter imports customer records. Future Order, Garment, Invoice, Payment, Inventory and other modules will register their own target adapters. Unsupported source tables are reported in the migration preview rather than silently discarded.

For the supplied DBF/FoxPro test backup, `CUSTOMER.DBF` is recognized and mapped from common legacy fields such as `FNAME`, `LNAME`, `COMPANY`, `CPHONE`, `HPHONE`, `WPHONE`, `ADDRESS`, `CITY`, `PROV`, `PCODE`, `EMAIL`, and `NOTE` when present.

## API workflow

### Analyze legacy source

`POST /api/v1/migrations/jobs/analyze`

- body: raw file bytes
- `X-File-Name`: original filename
- returns a durable migration job and preview summary

### Inspect job

`GET /api/v1/migrations/jobs/:id`

### Confirm import

`POST /api/v1/migrations/jobs/:id/import`

```json
{
  "confirm": true,
  "duplicatePolicy": "skip",
  "mapping": {
    "firstName": "FNAME",
    "lastName": "LNAME",
    "phone": "CPHONE",
    "address": "ADDRESS"
  }
}
```

### Export encrypted application backup

`POST /api/v1/migrations/backup/export`

```json
{ "password": "at-least-12-characters" }
```

### Restore encrypted application backup

`POST /api/v1/migrations/backup/restore`

- body: raw backup bytes
- `X-Backup-Password`: backup password
- restore is merge-only in v1 and does not delete records or replace staff credentials

## Storage

`MIGRATION_STORAGE_DIR` controls local source storage and is suitable for the current single-server deployment. The storage interface is deliberately isolated so production can replace local disk with encrypted object storage without changing migration business logic.

`MIGRATION_STORAGE_KEY` must be replaced with a strong random secret in production.

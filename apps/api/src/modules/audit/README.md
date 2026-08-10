# audit module

Status: infrastructure implemented; no route surface (and none is planned
yet).

The AuditLog model (prisma/schema.prisma), the write path
(src/lib/audit.ts's `recordAuditEvent`), and metadata secret-scrubbing
(`sanitizeAuditMetadata`) are foundation infrastructure - LOCKED decision,
see prisma/schema.prisma and docs/ARCHITECTURE.md. Business modules call
into this rather than writing to the `audit_logs` table directly or
reimplementing logging.

This folder holds no controller/routes because there is no approved
requirement yet for end users to browse the audit log via the API. If/when
that's approved, it belongs here.

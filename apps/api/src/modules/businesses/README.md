# businesses module

Status: not implemented (routes/controller/service) - the Business model
itself already exists at the foundation layer (prisma/schema.prisma)
because tenant isolation is a cross-cutting concern every other module
depends on. What's missing is the CRUD/API surface for managing
businesses (onboarding, settings, deactivation), which is deferred to
the implementation-order phase.

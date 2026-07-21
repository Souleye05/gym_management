// This module is read-only with no business-failure modes to express as domain errors — every
// unexpected failure (Prisma, connection) crosses the guardAgainstLeakingInternals boundary in
// DefaultClientHistoryService as a generic internal error, never a domain-specific one. This file
// exists to match the per-module domain/errors.ts convention used elsewhere (see
// server/clients/domain/errors.ts, server/auth/domain/errors.ts) and stays empty until a future
// write path (staff CRUD) introduces real business-failure modes.
export {}

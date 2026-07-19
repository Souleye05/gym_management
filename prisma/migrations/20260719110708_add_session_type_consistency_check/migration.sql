-- Enforces that a Session's populated fields match its type discriminator: a SUBSCRIBER
-- session must have clientId set and no visitor fields; a VISITOR session must have both
-- visitor fields set and no clientId. Prisma's schema DSL cannot express a conditional
-- multi-column CHECK constraint, so this is hand-written — same precedent as the existing
-- clients_phone_active_key partial unique index (see migration
-- 20260716074516_add_client_phone_active_unique_index).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_type_consistency_check" CHECK (
  ("type" = 'SUBSCRIBER' AND "clientId" IS NOT NULL AND "visitorName" IS NULL AND "visitorPhone" IS NULL)
  OR
  ("type" = 'VISITOR' AND "clientId" IS NULL AND "visitorName" IS NOT NULL AND "visitorPhone" IS NOT NULL)
);

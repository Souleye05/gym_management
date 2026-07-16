-- Enforce phone uniqueness among active clients atomically at the database level.
-- Prisma's schema DSL has no native support for partial/filtered unique indexes, so this
-- is hand-written rather than generated from schema.prisma. A plain @unique on "phone"
-- would be too strict (it would block reusing a deactivated client's old number); the
-- prior non-unique @@index([phone, isActive]) left createClient/updateClient's
-- application-level check-then-act (findByPhone then create/update) vulnerable to a race
-- between two concurrent requests submitting the same phone number.
CREATE UNIQUE INDEX "clients_phone_active_key" ON "clients"("phone") WHERE "isActive" = true;

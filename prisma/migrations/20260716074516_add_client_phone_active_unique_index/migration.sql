-- Enforce phone uniqueness among active clients atomically at the database level.
-- Prisma's schema DSL has no native support for partial/filtered unique indexes, so this
-- is hand-written rather than generated from schema.prisma. A plain @unique on "phone"
-- would be too strict (it would block reusing a deactivated client's old number); the
-- prior non-unique @@index([phone, isActive]) left createClient/updateClient's
-- application-level check-then-act (findByPhone then create/update) vulnerable to a race
-- between two concurrent requests submitting the same phone number.
--
-- Guard: fail loudly, before touching the index, if any duplicate active phone numbers
-- already exist (e.g. created during the race window this migration closes). Without this,
-- CREATE UNIQUE INDEX below would abort with a less obvious constraint-violation error
-- mid-build. Failing here first, with a message that names the actual problem, is deliberate.
DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT count(*) INTO duplicate_count FROM (
    SELECT "phone" FROM "clients" WHERE "isActive" = true GROUP BY "phone" HAVING count(*) > 1
  ) AS duplicates;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Cannot create clients_phone_active_key: % phone number(s) are shared by more than one active client. Resolve duplicates before reapplying this migration.', duplicate_count;
  END IF;
END $$;

-- NOT CONCURRENTLY: Postgres forbids CREATE INDEX CONCURRENTLY inside a transaction block,
-- and Prisma Migrate always wraps each migration file in one with no documented way to opt
-- a specific file out (confirmed against Prisma's docs and issue tracker as of 2026-07 —
-- there is no per-file transaction directive). This CREATE UNIQUE INDEX therefore holds a
-- table-level lock (ACCESS EXCLUSIVE briefly, then SHARE while building) for its duration.
-- Accepted for now: the table is small (early-stage project, low write volume). Before
-- deploying against a database with meaningful traffic, apply this specific index change
-- out-of-band with `psql`/`prisma db execute` using CONCURRENTLY, then mark the migration
-- applied via `prisma migrate resolve --applied` instead of letting `migrate deploy` run it.
CREATE UNIQUE INDEX "clients_phone_active_key" ON "clients"("phone") WHERE "isActive" = true;

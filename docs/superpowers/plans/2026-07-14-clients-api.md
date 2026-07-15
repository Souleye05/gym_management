# API Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real, persisted backend for the Clients module (Prisma model, Clean Architecture layers, REST API), replacing the in-memory mocked directory that currently powers the already-built frontend UI — without changing the API contract the frontend will eventually consume.

**Architecture:** Clean Architecture mirroring `server/auth/**` exactly: `domain` (pure types, zero deps) → `dto` (Zod validation) → `repositories` (interfaces) → `infrastructure` (Prisma implementation) → `services` (business rules, depends only on repository/infrastructure interfaces) → `http` (controllers: validate → call service → map response, zero business logic) → `app/api/clients/**` (one-line route re-exports).

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7 (`@prisma/adapter-pg`), Zod, Vitest (integration tests against a real Postgres instance via `prismaClient`).

## Global Constraints

- Clean Architecture: Controllers → Services → Domain → Repositories (interfaces) → Infrastructure. Controllers contain no business logic.
- `Result<T, E>` discriminated union (`server/shared/result.ts`, already exists) for all expected-failure returns — never throw for expected domain errors.
- Manual constructor-based dependency injection, no framework — services depend only on repository/service interfaces, never on Prisma or `next/server` directly (verify with `grep` for forbidden imports in `server/clients/services/*.ts`, same check pattern used for `server/auth/services/*.ts`).
- `cardSequence` (raw integer) is never exposed outside `server/clients/infrastructure/format-card-number.ts` and the Prisma layer — every other layer (domain, service, controller, API response) only ever sees the formatted `cardNumber: string`.
- `isActive` is the sole source of truth for "deactivated" — every query that should exclude deactivated clients filters on `isActive: true`. `deletedAt` is audit-only, never used as a filter condition.
- Phone uniqueness is a **service-level** business rule scoped to active clients (`findByPhone(phone, { activeOnly: true })`), never a Prisma `@unique` constraint.
- No Prisma exception (message, code, constraint name) ever crosses into an HTTP response — caught, logged server-side, mapped to a generic `internal-error` / 500.
- Vocabulary: the Service layer exposes `deactivateClient`, never `deleteClient`. The word "delete" is confined to the Repository's internal method name and the HTTP `DELETE` verb.
- Response envelope: `{ success, data, message, errors }`, matching `server/shared/api-response.ts`'s existing shape exactly (do not modify that file — build parallel `apiFailureFromClientDomainError` / `statusForClientDomainError` helpers scoped to this domain, mirroring `apiFailureFromDomainError` / `statusForDomainError`).
- After every task, run `npx tsc --noEmit` and the relevant `vitest run` — do not proceed to the next task with a red build.
- A code review must run after each layer is complete (Tasks 2, 3, 4, 6), per this project's standing rule — flag this explicitly to the user at each of those checkpoints rather than skipping it.

---

## File Structure

```
prisma/schema.prisma                                          — MODIFY: add Client model

server/clients/
  domain/
    entities.ts                                                — CREATE: Client type
    errors.ts                                                  — CREATE: ClientDomainErrorCode, ClientDomainError
  dto/
    client.dto.ts                                              — CREATE: CreateClientSchema, UpdateClientSchema (Zod)
  repositories/
    client.repository.ts                                       — CREATE: ClientRepository interface + supporting types
  infrastructure/
    format-card-number.ts                                      — CREATE: formatCardNumber, parseCardNumber
    prisma-client.repository.ts                                — CREATE: PrismaClientRepository
    test-helpers/
      clean-clients-table.ts                                   — CREATE: truncates the clients table between tests
  services/
    client.service.ts                                          — CREATE: ClientService interface
    default-client.service.ts                                  — CREATE: DefaultClientService
  http/
    list-clients.controller.ts                                 — CREATE: GET /api/clients
    create-client.controller.ts                                — CREATE: POST /api/clients
    get-client.controller.ts                                   — CREATE: GET /api/clients/:id
    update-client.controller.ts                                — CREATE: PATCH /api/clients/:id
    deactivate-client.controller.ts                             — CREATE: DELETE /api/clients/:id

server/shared/
  client-api-response.ts                                       — CREATE: apiFailureFromClientDomainError, statusForClientDomainError
  with-internal-error-handling.ts                               — CREATE: withInternalErrorHandling — wraps a controller body, converts a thrown internal-error into a clean 500 JSON envelope

app/api/clients/
  route.ts                                                      — CREATE: GET (list), POST (create)
  [id]/route.ts                                                 — CREATE: GET (detail), PATCH (update), DELETE (deactivate)
```

Each Prisma/domain/repository/service/controller file mirrors the one-responsibility-per-file convention already established in `server/auth/**`. Tests live next to the file they cover (`*.test.ts`), same as the Auth module.

---

## Task 1: Prisma schema — `Client` model and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_client/migration.sql` (generated by Prisma CLI, not hand-written)

**Interfaces:**
- Produces: `PrismaClient.client` (Prisma-generated model accessor), fields `id`, `clientAccountId`, `cardSequence`, `name`, `phone`, `email`, `isActive`, `deletedAt`, `joinedAt`, `updatedAt`.

- [ ] **Step 1: Read the current `ClientAccount` model to confirm the relation target**

Run: read `prisma/schema.prisma`, locate the `ClientAccount` model (has `id String @id @default(cuid())`). Confirm no existing field is named `client` on `ClientAccount` (Prisma requires the back-relation field name to be free).

- [ ] **Step 2: Add the `Client` model**

Add this block to `prisma/schema.prisma`, placed after the `ClientAccount` model:

```prisma
model Client {
  id              String    @id @default(cuid())
  clientAccountId String?   @unique
  cardSequence    Int       @unique @default(autoincrement())
  name            String
  phone           String
  email           String?
  isActive        Boolean   @default(true)
  deletedAt       DateTime?
  joinedAt        DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  clientAccount ClientAccount? @relation(fields: [clientAccountId], references: [id], onDelete: SetNull)

  @@index([phone, isActive])
  @@map("clients")
}
```

Add the inverse relation field to the existing `ClientAccount` model — find the model block and add one line inside it (do not duplicate the model, just add the field):

```prisma
  client Client?
```

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_client`
Expected: output ends with `Your database is now in sync with your schema.` and a new folder appears under `prisma/migrations/`.

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client ... to .\lib\generated\prisma`

- [ ] **Step 5: Verify the generated types include the new model**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing unrelated errors in the parallel `app/(staff)/clients/**` sub-project are expected and out of scope — ignore any error whose path contains `app/(staff)/clients`, `components/clients/`, `components/providers/clients-provider`, `components/subscriptions/`, `app/(staff)/seances`, or `components/sessions/client-search`).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Client model to Prisma schema"
```

---

## Task 2: Domain layer — `Client` entity and `ClientDomainError`

**Files:**
- Create: `server/clients/domain/entities.ts`
- Create: `server/clients/domain/errors.ts`

**Interfaces:**
- Consumes: nothing (domain layer has zero dependencies on other layers).
- Produces:
  - `Client` type: `{ id: string; cardNumber: string; name: string; phone: string; email: string | null; isActive: boolean; joinedAt: Date }`
  - `ClientDomainErrorCode`: `'not-found' | 'validation-error' | 'phone-already-used'`
  - `ClientDomainError`: `{ code: ClientDomainErrorCode; message: string; field?: string }`

- [ ] **Step 1: Write `entities.ts`**

```ts
// server/clients/domain/entities.ts
export type Client = {
  id: string
  cardNumber: string
  name: string
  phone: string
  email: string | null
  isActive: boolean
  joinedAt: Date
}
```

- [ ] **Step 2: Write `errors.ts`**

```ts
// server/clients/domain/errors.ts
export type ClientDomainErrorCode = 'not-found' | 'validation-error' | 'phone-already-used'

export type ClientDomainError = {
  code: ClientDomainErrorCode
  message: string
  field?: string
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (domain files have no imports, so this should be trivially clean).

- [ ] **Step 4: Commit**

```bash
git add server/clients/domain
git commit -m "feat: add Client domain entity and error types"
```

---

## Task 3: `format-card-number.ts` — card number formatting and parsing

This is the single place in the codebase that knows the `"CARD-00001"` format, in both directions. Both format and parse are pure functions — write tests first.

**Files:**
- Create: `server/clients/infrastructure/format-card-number.ts`
- Test: `server/clients/infrastructure/format-card-number.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatCardNumber(sequence: number): string` — e.g. `formatCardNumber(1)` → `"CARD-00001"`
  - `parseCardNumber(cardNumber: string): number | null` — e.g. `parseCardNumber("CARD-00001")` → `1`; malformed input → `null`

- [ ] **Step 1: Write the failing tests**

```ts
// server/clients/infrastructure/format-card-number.test.ts
import { describe, expect, it } from 'vitest'
import { formatCardNumber, parseCardNumber } from './format-card-number'

describe('formatCardNumber', () => {
  it('formats a sequence as a zero-padded 5-digit card number', () => {
    expect(formatCardNumber(1)).toBe('CARD-00001')
  })

  it('formats a large sequence without truncating', () => {
    expect(formatCardNumber(123456)).toBe('CARD-123456')
  })
})

describe('parseCardNumber', () => {
  it('parses a well-formed card number back to its sequence', () => {
    expect(parseCardNumber('CARD-00001')).toBe(1)
  })

  it('parses a large card number', () => {
    expect(parseCardNumber('CARD-123456')).toBe(123456)
  })

  it('returns null for a missing prefix', () => {
    expect(parseCardNumber('00001')).toBeNull()
  })

  it('returns null for a non-numeric suffix', () => {
    expect(parseCardNumber('CARD-abcde')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseCardNumber('')).toBeNull()
  })

  it('round-trips formatCardNumber output', () => {
    expect(parseCardNumber(formatCardNumber(42))).toBe(42)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/clients/infrastructure/format-card-number.test.ts`
Expected: FAIL — `Cannot find module './format-card-number'`

- [ ] **Step 3: Write the implementation**

```ts
// server/clients/infrastructure/format-card-number.ts
const CARD_NUMBER_PATTERN = /^CARD-(\d+)$/

export function formatCardNumber(sequence: number): string {
  return `CARD-${String(sequence).padStart(5, '0')}`
}

export function parseCardNumber(cardNumber: string): number | null {
  const match = CARD_NUMBER_PATTERN.exec(cardNumber)
  if (!match) return null
  return Number(match[1])
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/clients/infrastructure/format-card-number.test.ts`
Expected: `Tests  7 passed (7)`

- [ ] **Step 5: Commit**

```bash
git add server/clients/infrastructure/format-card-number.ts server/clients/infrastructure/format-card-number.test.ts
git commit -m "feat: add card number formatting and parsing helpers"
```

---

## Task 4: Repository layer — `ClientRepository` interface and Prisma implementation

**Files:**
- Create: `server/clients/repositories/client.repository.ts`
- Create: `server/clients/infrastructure/prisma-client.repository.ts`
- Create: `server/clients/infrastructure/test-helpers/clean-clients-table.ts`
- Test: `server/clients/infrastructure/prisma-client.repository.test.ts`

**Interfaces:**
- Consumes: `Client` (Task 2, `server/clients/domain/entities.ts`), `formatCardNumber`/`parseCardNumber` (Task 3), `prismaClient` (`server/shared/prisma-client.ts`, already exists).
- Produces:
  ```ts
  export type CreateClientInput = { name: string; phone: string; email?: string }
  export type UpdateClientInput = Partial<{ name: string; phone: string; email: string | null }>
  export type FindByPhoneOptions = { activeOnly: boolean }

  export interface ClientRepository {
    create(input: CreateClientInput): Promise<Client>
    findById(id: string): Promise<Client | null>
    findByPhone(phone: string, options: FindByPhoneOptions): Promise<Client | null>
    findByCardSequence(sequence: number): Promise<Client | null>
    search(query: string): Promise<Client[]>
    update(id: string, input: UpdateClientInput): Promise<Client>
    deactivate(id: string): Promise<void>
  }
  ```
  `PrismaClientRepository implements ClientRepository`, plus `cleanClientsTable(): Promise<void>` test helper.

- [ ] **Step 1: Write the repository interface**

```ts
// server/clients/repositories/client.repository.ts
import type { Client } from '../domain/entities'

export type CreateClientInput = {
  name: string
  phone: string
  email?: string
}

export type UpdateClientInput = Partial<{
  name: string
  phone: string
  email: string | null
}>

export type FindByPhoneOptions = {
  activeOnly: boolean
}

export interface ClientRepository {
  create(input: CreateClientInput): Promise<Client>
  findById(id: string): Promise<Client | null>
  /** Excludes deactivated clients when `activeOnly` is true. */
  findByPhone(phone: string, options: FindByPhoneOptions): Promise<Client | null>
  /** Looks up by the raw card sequence integer (already parsed from "CARD-xxxxx" by the caller). */
  findByCardSequence(sequence: number): Promise<Client | null>
  /** Case-insensitive substring match on name or phone, active clients only. Empty query returns []. */
  search(query: string): Promise<Client[]>
  update(id: string, input: UpdateClientInput): Promise<Client>
  /** Soft delete: sets isActive to false and deletedAt to now. */
  deactivate(id: string): Promise<void>
}
```

- [ ] **Step 2: Write the test-helper for table cleanup**

```ts
// server/clients/infrastructure/test-helpers/clean-clients-table.ts
import { prismaClient } from '../../../shared/prisma-client'

/** Deletes all rows from the clients table. Call before each integration test for isolation. */
export async function cleanClientsTable(): Promise<void> {
  await prismaClient.client.deleteMany()
}
```

- [ ] **Step 3: Write the failing integration tests**

```ts
// server/clients/infrastructure/prisma-client.repository.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanClientsTable } from './test-helpers/clean-clients-table'
import { PrismaClientRepository } from './prisma-client.repository'

const repository = new PrismaClientRepository(prismaClient)

beforeEach(async () => {
  await cleanClientsTable()
})

describe('PrismaClientRepository.create', () => {
  it('creates a client and returns it with a formatted card number', async () => {
    const client = await repository.create({ name: 'Yasmine Kaddour', phone: '+33612345601' })

    expect(client.name).toBe('Yasmine Kaddour')
    expect(client.phone).toBe('+33612345601')
    expect(client.email).toBeNull()
    expect(client.isActive).toBe(true)
    expect(client.cardNumber).toMatch(/^CARD-\d{5,}$/)
  })

  it('stores an optional email when provided', async () => {
    const client = await repository.create({ name: 'Marc Delaunay', phone: '+33612345602', email: 'marc@example.com' })

    expect(client.email).toBe('marc@example.com')
  })

  it('assigns sequential, unique card numbers to successive clients', async () => {
    const first = await repository.create({ name: 'Client A', phone: '+33600000001' })
    const second = await repository.create({ name: 'Client B', phone: '+33600000002' })

    expect(first.cardNumber).not.toBe(second.cardNumber)
  })
})

describe('PrismaClientRepository.findById', () => {
  it('finds a client by id', async () => {
    const created = await repository.create({ name: 'Inès Fabre', phone: '+33612345603' })

    const found = await repository.findById(created.id)

    expect(found?.name).toBe('Inès Fabre')
  })

  it('returns null when the id does not exist', async () => {
    const found = await repository.findById('does-not-exist')
    expect(found).toBeNull()
  })
})

describe('PrismaClientRepository.findByPhone', () => {
  it('finds an active client by exact phone match', async () => {
    await repository.create({ name: 'Karim Benali', phone: '+33612345604' })

    const found = await repository.findByPhone('+33612345604', { activeOnly: true })

    expect(found?.name).toBe('Karim Benali')
  })

  it('excludes deactivated clients when activeOnly is true', async () => {
    const created = await repository.create({ name: 'Old Client', phone: '+33612345605' })
    await repository.deactivate(created.id)

    const found = await repository.findByPhone('+33612345605', { activeOnly: true })

    expect(found).toBeNull()
  })

  it('includes deactivated clients when activeOnly is false', async () => {
    const created = await repository.create({ name: 'Old Client', phone: '+33612345606' })
    await repository.deactivate(created.id)

    const found = await repository.findByPhone('+33612345606', { activeOnly: false })

    expect(found?.id).toBe(created.id)
  })

  it('returns null when no client has that phone', async () => {
    const found = await repository.findByPhone('+33600000000', { activeOnly: true })
    expect(found).toBeNull()
  })
})

describe('PrismaClientRepository.findByCardSequence', () => {
  it('finds a client by its raw card sequence', async () => {
    const created = await repository.create({ name: 'Sequence Test', phone: '+33612345607' })

    const found = await repository.findByCardSequence(
      Number(created.cardNumber.replace('CARD-', '')),
    )

    expect(found?.id).toBe(created.id)
  })

  it('returns null for a sequence that does not exist', async () => {
    const found = await repository.findByCardSequence(999999)
    expect(found).toBeNull()
  })
})

describe('PrismaClientRepository.search', () => {
  it('matches by case-insensitive name substring', async () => {
    await repository.create({ name: 'Yasmine Kaddour', phone: '+33612345601' })

    const results = await repository.search('yasmine')

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Yasmine Kaddour')
  })

  it('matches by phone substring', async () => {
    await repository.create({ name: 'Marc Delaunay', phone: '+33612345602' })

    const results = await repository.search('345602')

    expect(results).toHaveLength(1)
  })

  it('returns an empty array for an empty query', async () => {
    await repository.create({ name: 'Client A', phone: '+33600000001' })

    const results = await repository.search('')

    expect(results).toEqual([])
  })

  it('excludes deactivated clients', async () => {
    const created = await repository.create({ name: 'Deactivated Person', phone: '+33600000002' })
    await repository.deactivate(created.id)

    const results = await repository.search('deactivated')

    expect(results).toEqual([])
  })
})

describe('PrismaClientRepository.update', () => {
  it('updates the provided fields and leaves others unchanged', async () => {
    const created = await repository.create({ name: 'Original Name', phone: '+33612345608', email: 'orig@example.com' })

    const updated = await repository.update(created.id, { name: 'New Name' })

    expect(updated.name).toBe('New Name')
    expect(updated.phone).toBe('+33612345608')
    expect(updated.email).toBe('orig@example.com')
  })

  it('can clear the email by passing null', async () => {
    const created = await repository.create({ name: 'Has Email', phone: '+33612345609', email: 'has@example.com' })

    const updated = await repository.update(created.id, { email: null })

    expect(updated.email).toBeNull()
  })
})

describe('PrismaClientRepository.deactivate', () => {
  it('sets isActive to false and stamps deletedAt', async () => {
    const created = await repository.create({ name: 'To Deactivate', phone: '+33612345610' })

    await repository.deactivate(created.id)

    const found = await repository.findById(created.id)
    expect(found?.isActive).toBe(false)
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run server/clients/infrastructure/prisma-client.repository.test.ts`
Expected: FAIL — `Cannot find module './prisma-client.repository'`

- [ ] **Step 5: Write the Prisma implementation**

```ts
// server/clients/infrastructure/prisma-client.repository.ts
import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import type { Client } from '../domain/entities'
import type {
  ClientRepository,
  CreateClientInput,
  FindByPhoneOptions,
  UpdateClientInput,
} from '../repositories/client.repository'
import { formatCardNumber } from './format-card-number'

type PrismaClientRow = {
  id: string
  cardSequence: number
  name: string
  phone: string
  email: string | null
  isActive: boolean
  joinedAt: Date
}

function toDomain(row: PrismaClientRow): Client {
  return {
    id: row.id,
    cardNumber: formatCardNumber(row.cardSequence),
    name: row.name,
    phone: row.phone,
    email: row.email,
    isActive: row.isActive,
    joinedAt: row.joinedAt,
  }
}

export class PrismaClientRepository implements ClientRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async create(input: CreateClientInput): Promise<Client> {
    const row = await this.prisma.client.create({
      data: { name: input.name, phone: input.phone, email: input.email ?? null },
    })
    return toDomain(row)
  }

  async findById(id: string): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async findByPhone(phone: string, options: FindByPhoneOptions): Promise<Client | null> {
    const row = await this.prisma.client.findFirst({
      where: { phone, ...(options.activeOnly ? { isActive: true } : {}) },
    })
    return row ? toDomain(row) : null
  }

  async findByCardSequence(sequence: number): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { cardSequence: sequence } })
    return row ? toDomain(row) : null
  }

  async search(query: string): Promise<Client[]> {
    const trimmed = query.trim()
    if (trimmed.length === 0) return []
    const rows = await this.prisma.client.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: trimmed, mode: 'insensitive' } },
          { phone: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
    })
    return rows.map(toDomain)
  }

  async update(id: string, input: UpdateClientInput): Promise<Client> {
    const row = await this.prisma.client.update({
      where: { id },
      data: input,
    })
    return toDomain(row)
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.client.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    })
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run server/clients/infrastructure/prisma-client.repository.test.ts`
Expected: all tests pass (18 tests across the 6 describe blocks above).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (same exclusion list as Task 1 Step 5 applies).

- [ ] **Step 8: Commit**

```bash
git add server/clients/repositories server/clients/infrastructure
git commit -m "feat: add ClientRepository interface and Prisma implementation"
```

- [ ] **Step 9: Flag for code review**

This completes the Repository layer. Per this project's standing rule, run the code-review skill on the diff so far (Tasks 1–4) before proceeding — do not skip this even though no one asked again this session.

---

## Task 5: DTO layer — Zod schemas for create/update

**Files:**
- Create: `server/clients/dto/client.dto.ts`
- Test: `server/clients/dto/client.dto.test.ts`

**Interfaces:**
- Consumes: `zod` (already a project dependency).
- Produces:
  ```ts
  export const CreateClientSchema: ZodSchema
  export type CreateClientDto = { name: string; phone: string; email?: string }
  export const UpdateClientSchema: ZodSchema
  export type UpdateClientDto = { name?: string; phone?: string; email?: string | null }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// server/clients/dto/client.dto.test.ts
import { describe, expect, it } from 'vitest'
import { CreateClientSchema, UpdateClientSchema } from './client.dto'

describe('CreateClientSchema', () => {
  it('accepts a valid payload with all fields', () => {
    const result = CreateClientSchema.safeParse({ name: 'Yasmine Kaddour', phone: '+33612345601', email: 'y@example.com' })
    expect(result.success).toBe(true)
  })

  it('accepts a valid payload without email', () => {
    const result = CreateClientSchema.safeParse({ name: 'Marc Delaunay', phone: '+33612345602' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = CreateClientSchema.safeParse({ name: '', phone: '+33612345601' })
    expect(result.success).toBe(false)
  })

  it('rejects a phone that is too short', () => {
    const result = CreateClientSchema.safeParse({ name: 'Test', phone: '123' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid email when provided', () => {
    const result = CreateClientSchema.safeParse({ name: 'Test', phone: '+33612345601', email: 'not-an-email' })
    expect(result.success).toBe(false)
  })
})

describe('UpdateClientSchema', () => {
  it('accepts a partial payload with a single field', () => {
    const result = UpdateClientSchema.safeParse({ name: 'New Name' })
    expect(result.success).toBe(true)
  })

  it('accepts an empty object (no-op update)', () => {
    const result = UpdateClientSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts email set to null to clear it', () => {
    const result = UpdateClientSchema.safeParse({ email: null })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name if name is provided', () => {
    const result = UpdateClientSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/clients/dto/client.dto.test.ts`
Expected: FAIL — `Cannot find module './client.dto'`

- [ ] **Step 3: Write the schemas**

Phone validation mirrors the pattern already used in `server/auth/dto/client-otp.dto.ts` (`/^\+\d{8,15}$/`), reused here for consistency with the rest of the codebase.

```ts
// server/clients/dto/client.dto.ts
import { z } from 'zod'

const PHONE_PATTERN = /^\+\d{8,15}$/

export const CreateClientSchema = z.object({
  name: z.string().trim().min(1, { message: 'Le nom est requis' }),
  phone: z.string().regex(PHONE_PATTERN, { message: 'Numéro de téléphone invalide' }),
  email: z.string().email({ message: 'Adresse e-mail invalide' }).optional(),
})

export type CreateClientDto = z.infer<typeof CreateClientSchema>

export const UpdateClientSchema = z.object({
  name: z.string().trim().min(1, { message: 'Le nom est requis' }).optional(),
  phone: z.string().regex(PHONE_PATTERN, { message: 'Numéro de téléphone invalide' }).optional(),
  email: z.string().email({ message: 'Adresse e-mail invalide' }).nullable().optional(),
})

export type UpdateClientDto = z.infer<typeof UpdateClientSchema>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/clients/dto/client.dto.test.ts`
Expected: `Tests  9 passed (9)`

- [ ] **Step 5: Commit**

```bash
git add server/clients/dto
git commit -m "feat: add Zod DTOs for Client create/update"
```

---

## Task 6: Service layer — `ClientService` with business rules

**Files:**
- Create: `server/clients/services/client.service.ts`
- Create: `server/clients/services/default-client.service.ts`
- Test: `server/clients/services/default-client.service.test.ts`

**Interfaces:**
- Consumes: `Client` (Task 2), `ClientDomainError` (Task 2), `ClientRepository`/`CreateClientInput`/`UpdateClientInput` (Task 4), `CreateClientDto`/`UpdateClientDto` (Task 5), `Result`/`ok`/`err` (`server/shared/result.ts`, already exists).
- Produces:
  ```ts
  export interface ClientService {
    createClient(input: CreateClientDto): Promise<Result<Client, ClientDomainError>>
    getClient(id: string): Promise<Result<Client, ClientDomainError>>
    listClients(query?: string): Promise<Client[]>
    findByPhone(phone: string): Promise<Client | null>
    findByCardNumber(cardNumber: string): Promise<Client | null>
    updateClient(id: string, input: UpdateClientDto): Promise<Result<Client, ClientDomainError>>
    deactivateClient(id: string): Promise<Result<void, ClientDomainError>>
  }
  ```
  `DefaultClientService implements ClientService`, constructor takes a single `ClientRepository`.

Per the design doc, no Prisma exception may cross the Service boundary with its raw message intact. This task wraps every repository call that can throw a non-domain error (i.e. anything the `not-found`/`phone-already-used` checks don't already intercept — a connection drop, an unexpected constraint violation) in a try/catch that logs the original error server-side and re-throws a generic `Error('internal-error')`. The Controller layer (Task 9) never sees Prisma details; it only sees either a `ClientDomainError` (handled via `Result`) or a generic thrown `Error` it maps to a 500.

- [ ] **Step 1: Write the service interface**

```ts
// server/clients/services/client.service.ts
import type { Result } from '../../shared/result'
import type { Client } from '../domain/entities'
import type { ClientDomainError } from '../domain/errors'
import type { CreateClientDto, UpdateClientDto } from '../dto/client.dto'

export interface ClientService {
  createClient(input: CreateClientDto): Promise<Result<Client, ClientDomainError>>
  getClient(id: string): Promise<Result<Client, ClientDomainError>>
  /** Empty/absent query returns all active clients; otherwise a substring search on name/phone. */
  listClients(query?: string): Promise<Client[]>
  findByPhone(phone: string): Promise<Client | null>
  /** Accepts a formatted card number (e.g. "CARD-00001"). Returns null if malformed or not found. */
  findByCardNumber(cardNumber: string): Promise<Client | null>
  updateClient(id: string, input: UpdateClientDto): Promise<Result<Client, ClientDomainError>>
  deactivateClient(id: string): Promise<Result<void, ClientDomainError>>
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// server/clients/services/default-client.service.test.ts
import { describe, expect, it } from 'vitest'
import { ok } from '../../shared/result'
import type { Client } from '../domain/entities'
import type {
  ClientRepository,
  CreateClientInput,
  FindByPhoneOptions,
  UpdateClientInput,
} from '../repositories/client.repository'
import { DefaultClientService } from './default-client.service'

const CLIENT: Client = {
  id: 'c1',
  cardNumber: 'CARD-00001',
  name: 'Yasmine Kaddour',
  phone: '+33612345601',
  email: null,
  isActive: true,
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function fakeClientRepository(overrides: Partial<ClientRepository> = {}): ClientRepository {
  return {
    create: async (input: CreateClientInput) => ({ ...CLIENT, name: input.name, phone: input.phone, email: input.email ?? null }),
    findById: async (id) => (id === CLIENT.id ? CLIENT : null),
    findByPhone: async () => null,
    findByCardSequence: async (sequence) => (sequence === 1 ? CLIENT : null),
    search: async () => [CLIENT],
    update: async (id, input: UpdateClientInput) => ({ ...CLIENT, ...input }),
    deactivate: async () => {},
    ...overrides,
  }
}

describe('DefaultClientService.createClient', () => {
  it('creates a client when the phone is not already used by an active client', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.createClient({ name: 'Yasmine Kaddour', phone: '+33612345601' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.name).toBe('Yasmine Kaddour')
  })

  it('rejects when the phone is already used by an active client', async () => {
    const repository = fakeClientRepository({ findByPhone: async () => CLIENT })
    const service = new DefaultClientService(repository)

    const result = await service.createClient({ name: 'Another Person', phone: '+33612345601' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('phone-already-used')
  })

  it('checks phone uniqueness scoped to active clients only', async () => {
    const calls: FindByPhoneOptions[] = []
    const repository = fakeClientRepository({
      findByPhone: async (_phone, options) => {
        calls.push(options)
        return null
      },
    })
    const service = new DefaultClientService(repository)

    await service.createClient({ name: 'Test', phone: '+33612345601' })

    expect(calls).toEqual([{ activeOnly: true }])
  })
})

describe('DefaultClientService.getClient', () => {
  it('returns the client when found', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.getClient('c1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.id).toBe('c1')
  })

  it('returns not-found when the client does not exist', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.getClient('missing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })
})

describe('DefaultClientService.listClients', () => {
  it('returns search results when a query is provided', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const results = await service.listClients('yasmine')

    expect(results).toEqual([CLIENT])
  })
})

describe('DefaultClientService.findByCardNumber', () => {
  it('parses the card number and delegates to findByCardSequence', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const found = await service.findByCardNumber('CARD-00001')

    expect(found?.id).toBe('c1')
  })

  it('returns null for a malformed card number without querying the repository', async () => {
    const repository = fakeClientRepository({
      findByCardSequence: async () => {
        throw new Error('should not be called for a malformed card number')
      },
    })
    const service = new DefaultClientService(repository)

    const found = await service.findByCardNumber('not-a-card-number')

    expect(found).toBeNull()
  })
})

describe('DefaultClientService.updateClient', () => {
  it('updates the client when the phone change does not collide', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.updateClient('c1', { name: 'Updated Name' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.name).toBe('Updated Name')
  })

  it('returns not-found when updating a nonexistent client', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.updateClient('missing', { name: 'X' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })

  it('rejects when changing the phone to one already used by another active client', async () => {
    const otherClient: Client = { ...CLIENT, id: 'c2', phone: '+33612345699' }
    const repository = fakeClientRepository({
      findByPhone: async (phone) => (phone === '+33612345699' ? otherClient : null),
    })
    const service = new DefaultClientService(repository)

    const result = await service.updateClient('c1', { phone: '+33612345699' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('phone-already-used')
  })

  it('allows updating a client to keep its own current phone unchanged', async () => {
    const repository = fakeClientRepository({
      findByPhone: async (phone) => (phone === CLIENT.phone ? CLIENT : null),
    })
    const service = new DefaultClientService(repository)

    const result = await service.updateClient('c1', { phone: CLIENT.phone })

    expect(result.ok).toBe(true)
  })
})

describe('DefaultClientService.deactivateClient', () => {
  it('deactivates an existing client', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.deactivateClient('c1')

    expect(result.ok).toBe(true)
  })

  it('returns not-found when deactivating a nonexistent client', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.deactivateClient('missing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })
})

describe('DefaultClientService unexpected repository failures', () => {
  it('never lets a raw repository error message escape createClient', async () => {
    const repository = fakeClientRepository({
      create: async () => {
        throw new Error('relation "clients" violates constraint xyz_pk on column "id"')
      },
    })
    const service = new DefaultClientService(repository)

    await expect(service.createClient({ name: 'Test', phone: '+33612345601' })).rejects.toThrow('internal-error')
  })

  it('never lets a raw repository error message escape getClient', async () => {
    const repository = fakeClientRepository({
      findById: async () => {
        throw new Error('connection terminated unexpectedly')
      },
    })
    const service = new DefaultClientService(repository)

    await expect(service.getClient('c1')).rejects.toThrow('internal-error')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run server/clients/services/default-client.service.test.ts`
Expected: FAIL — `Cannot find module './default-client.service'`

- [ ] **Step 4: Write the implementation**

```ts
// server/clients/services/default-client.service.ts
import { err, ok, type Result } from '../../shared/result'
import type { Client } from '../domain/entities'
import type { ClientDomainError } from '../domain/errors'
import type { CreateClientDto, UpdateClientDto } from '../dto/client.dto'
import type { ClientRepository } from '../repositories/client.repository'
import { parseCardNumber } from '../infrastructure/format-card-number'
import type { ClientService } from './client.service'

const NOT_FOUND: ClientDomainError = { code: 'not-found', message: 'Client introuvable.' }
const PHONE_ALREADY_USED: ClientDomainError = {
  code: 'phone-already-used',
  message: 'Ce numéro de téléphone est déjà utilisé par un autre client.',
  field: 'phone',
}

/**
 * Runs a repository call and, if it throws anything other than a ClientDomainError-carrying
 * rejection (this repository never throws those — domain failures are always expressed via the
 * Result-returning callers above, never by throwing), logs the real error server-side and rethrows
 * a generic error whose message is safe to eventually surface in an HTTP response. No Prisma
 * message, code, or constraint name is ever allowed past this boundary.
 */
async function guardAgainstLeakingInternals<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    console.error('[ClientService] unexpected repository failure', cause)
    throw new Error('internal-error')
  }
}

export class DefaultClientService implements ClientService {
  constructor(private readonly clientRepository: ClientRepository) {}

  async createClient(input: CreateClientDto): Promise<Result<Client, ClientDomainError>> {
    return guardAgainstLeakingInternals(async () => {
      const existing = await this.clientRepository.findByPhone(input.phone, { activeOnly: true })
      if (existing) return err(PHONE_ALREADY_USED)

      const client = await this.clientRepository.create(input)
      return ok(client)
    })
  }

  async getClient(id: string): Promise<Result<Client, ClientDomainError>> {
    return guardAgainstLeakingInternals(async () => {
      const client = await this.clientRepository.findById(id)
      if (!client) return err(NOT_FOUND)
      return ok(client)
    })
  }

  async listClients(query?: string): Promise<Client[]> {
    return guardAgainstLeakingInternals(async () => {
      if (!query || query.trim().length === 0) return []
      return this.clientRepository.search(query)
    })
  }

  async findByPhone(phone: string): Promise<Client | null> {
    return guardAgainstLeakingInternals(() => this.clientRepository.findByPhone(phone, { activeOnly: true }))
  }

  async findByCardNumber(cardNumber: string): Promise<Client | null> {
    const sequence = parseCardNumber(cardNumber)
    if (sequence === null) return null
    return guardAgainstLeakingInternals(() => this.clientRepository.findByCardSequence(sequence))
  }

  async updateClient(id: string, input: UpdateClientDto): Promise<Result<Client, ClientDomainError>> {
    return guardAgainstLeakingInternals(async () => {
      const existing = await this.clientRepository.findById(id)
      if (!existing) return err(NOT_FOUND)

      if (input.phone && input.phone !== existing.phone) {
        const phoneOwner = await this.clientRepository.findByPhone(input.phone, { activeOnly: true })
        if (phoneOwner) return err(PHONE_ALREADY_USED)
      }

      const updated = await this.clientRepository.update(id, input)
      return ok(updated)
    })
  }

  async deactivateClient(id: string): Promise<Result<void, ClientDomainError>> {
    return guardAgainstLeakingInternals(async () => {
      const existing = await this.clientRepository.findById(id)
      if (!existing) return err(NOT_FOUND)

      await this.clientRepository.deactivate(id)
      return ok(undefined)
    })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/clients/services/default-client.service.test.ts`
Expected: all tests pass (16 tests across the 6 describe blocks above).

- [ ] **Step 6: Verify no forbidden imports leaked into the service layer**

Run: `grep -n "next/server\|@prisma/client\|generated/prisma" server/clients/services/*.ts`
Expected: no output (services depend only on domain/dto/repository interfaces, never Prisma or Next.js types directly).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (same exclusion list as Task 1 Step 5 applies).

- [ ] **Step 8: Commit**

```bash
git add server/clients/services
git commit -m "feat: add ClientService with phone-uniqueness and not-found rules"
```

- [ ] **Step 9: Flag for code review**

This completes the Service layer. Per this project's standing rule, run the code-review skill on the diff so far (Task 5–6) before proceeding.

---

## Task 7: Shared HTTP response helpers for the Clients domain

**Files:**
- Create: `server/shared/client-api-response.ts`
- Create: `server/shared/with-internal-error-handling.ts`
- Test: `server/shared/with-internal-error-handling.test.ts`

**Interfaces:**
- Consumes: `ClientDomainError` (Task 2), `ApiFailure`/`apiFailure` (`server/shared/api-response.ts`, already exists — reused, not modified).
- Produces:
  ```ts
  export function apiFailureFromClientDomainError(error: ClientDomainError): ApiFailure
  export function statusForClientDomainError(error: ClientDomainError): number
  export function withInternalErrorHandling(handler: () => Promise<NextResponse>): Promise<NextResponse>
  ```

- [ ] **Step 1: Write `client-api-response.ts`**

No test file for this half of the task — it's two small pure functions with no branching logic worth a dedicated suite beyond what Task 9's controller integration tests already exercise end-to-end (same pattern as `server/shared/http-status.ts`, which has no standalone test file either).

```ts
// server/shared/client-api-response.ts
import type { ClientDomainError } from '../clients/domain/errors'
import { apiFailure, type ApiFailure } from './api-response'

export function apiFailureFromClientDomainError(error: ClientDomainError): ApiFailure {
  if (error.field) {
    return apiFailure(error.message, [{ field: error.field, message: error.message }])
  }
  return apiFailure(error.message)
}

export function statusForClientDomainError(error: ClientDomainError): number {
  switch (error.code) {
    case 'not-found':
      return 404
    case 'phone-already-used':
      return 409
    case 'validation-error':
      return 400
  }
}
```

- [ ] **Step 2: Write the failing test for `withInternalErrorHandling`**

This is the piece that turns `DefaultClientService`'s thrown `Error('internal-error')` (Task 6) into the clean `{ error: 'internal-error' }` / 500 JSON response the design doc requires, without leaking the original Prisma message. Every controller in Task 9 wraps its body with this helper.

```ts
// server/shared/with-internal-error-handling.test.ts
import { NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { withInternalErrorHandling } from './with-internal-error-handling'

describe('withInternalErrorHandling', () => {
  it('returns the handler result unchanged on success', async () => {
    const response = await withInternalErrorHandling(async () => NextResponse.json({ ok: true }, { status: 200 }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('converts a thrown internal-error into a 500 with a generic body, without leaking the cause', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await withInternalErrorHandling(async () => {
      throw new Error('internal-error')
    })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ success: false, data: null, message: 'internal-error', errors: null })

    consoleErrorSpy.mockRestore()
  })

  it('also converts an unrelated thrown error into the same generic 500 shape', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await withInternalErrorHandling(async () => {
      throw new Error('relation "clients" violates constraint xyz_pk')
    })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.message).toBe('internal-error')
    expect(JSON.stringify(json)).not.toContain('constraint')

    consoleErrorSpy.mockRestore()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run server/shared/with-internal-error-handling.test.ts`
Expected: FAIL — `Cannot find module './with-internal-error-handling'`

- [ ] **Step 4: Write the implementation**

```ts
// server/shared/with-internal-error-handling.ts
import { NextResponse } from 'next/server'
import { apiFailure } from './api-response'

/**
 * Wraps a controller body. Any thrown error (deliberately generic Error('internal-error') from a
 * Service's guardAgainstLeakingInternals, or anything unexpected that slipped past it) becomes a
 * uniform 500 response whose body never contains the original error's message — only the literal
 * string "internal-error" crosses into the HTTP response. The real cause is logged server-side.
 */
export async function withInternalErrorHandling(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler()
  } catch (cause) {
    console.error('[Controller] unhandled error', cause)
    return NextResponse.json(apiFailure('internal-error'), { status: 500 })
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run server/shared/with-internal-error-handling.test.ts`
Expected: `Tests  3 passed (3)`

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/shared/client-api-response.ts server/shared/with-internal-error-handling.ts server/shared/with-internal-error-handling.test.ts
git commit -m "feat: add HTTP response helpers and internal-error boundary for Client domain"
```

---

## Task 8: Composition root — extend `getContainer()` with `clientService`

**Files:**
- Modify: `server/shared/container.ts`

**Interfaces:**
- Consumes: `PrismaClientRepository` (Task 4), `DefaultClientService` (Task 6), `prismaClient` (already imported in this file).
- Produces: `Container.clientService: ClientService`, accessible via the existing `getContainer()` function.

- [ ] **Step 1: Modify `container.ts`**

Add imports (alongside the existing auth imports):

```ts
import { PrismaClientRepository } from '../clients/infrastructure/prisma-client.repository'
import { DefaultClientService } from '../clients/services/default-client.service'
import type { ClientService } from '../clients/services/client.service'
```

Add `clientService` to the `Container` type:

```ts
export type Container = {
  staffAuthService: StaffAuthService
  clientAuthService: ClientAuthService
  refreshTokenLookupService: RefreshTokenLookupService
  clientService: ClientService
}
```

Inside `createContainer()`, before the `return` statement, add:

```ts
  const clientRepository = new PrismaClientRepository(prismaClient)
  const clientService = new DefaultClientService(clientRepository)
```

Update the `return` statement:

```ts
  return { staffAuthService, clientAuthService, refreshTokenLookupService, clientService }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full existing test suite to confirm nothing in Auth broke**

Run: `npx vitest run`
Expected: all previously-passing tests still pass (116 as of the last Auth work, plus the new Client tests from Tasks 3–6).

- [ ] **Step 4: Commit**

```bash
git add server/shared/container.ts
git commit -m "feat: wire ClientService into the composition root"
```

---

## Task 9: HTTP controllers

**Files:**
- Create: `server/clients/http/list-clients.controller.ts`
- Create: `server/clients/http/create-client.controller.ts`
- Create: `server/clients/http/get-client.controller.ts`
- Create: `server/clients/http/update-client.controller.ts`
- Create: `server/clients/http/deactivate-client.controller.ts`
- Test: `server/clients/http/list-clients.controller.test.ts`
- Test: `server/clients/http/create-client.controller.test.ts`
- Test: `server/clients/http/get-client.controller.test.ts`
- Test: `server/clients/http/update-client.controller.test.ts`
- Test: `server/clients/http/deactivate-client.controller.test.ts`

**Interfaces:**
- Consumes: `getContainer()` (Task 8), `CreateClientSchema`/`UpdateClientSchema` (Task 5), `apiSuccess`/`apiFailureFromZod` (`server/shared/api-response.ts`), `apiFailureFromClientDomainError`/`statusForClientDomainError`/`withInternalErrorHandling` (Task 7).
- Produces: 5 exported controller functions, each `(req: NextRequest) => Promise<NextResponse>` (the `[id]` ones taking `id: string` as a second argument), matching the Auth module's controller signature exactly. Every controller body is wrapped in `withInternalErrorHandling` so a thrown `Error('internal-error')` from the Service layer (Task 6) becomes a clean 500 envelope instead of an unhandled exception.

- [ ] **Step 1: Write `list-clients.controller.ts`**

```ts
// server/clients/http/list-clients.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'

export async function listClientsController(req: NextRequest): Promise<NextResponse> {
  return withInternalErrorHandling(async () => {
    const { searchParams } = new URL(req.url)
    const cardNumber = searchParams.get('cardNumber')
    const phone = searchParams.get('phone')
    const q = searchParams.get('q')

    const { clientService } = getContainer()

    if (cardNumber) {
      const client = await clientService.findByCardNumber(cardNumber)
      return NextResponse.json(apiSuccess({ clients: client ? [client] : [] }))
    }

    if (phone) {
      const client = await clientService.findByPhone(phone)
      return NextResponse.json(apiSuccess({ clients: client ? [client] : [] }))
    }

    const clients = await clientService.listClients(q ?? undefined)
    return NextResponse.json(apiSuccess({ clients }))
  })
}
```

- [ ] **Step 2: Write `create-client.controller.ts`**

```ts
// server/clients/http/create-client.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromZod, apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { CreateClientSchema } from '../dto/client.dto'

export async function createClientController(req: NextRequest): Promise<NextResponse> {
  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = CreateClientSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { clientService } = getContainer()
    const result = await clientService.createClient(parsed.data)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ client: result.value }, 'Client créé'), { status: 201 })
  })
}
```

- [ ] **Step 3: Write `get-client.controller.ts`**

```ts
// server/clients/http/get-client.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'

export async function getClientController(req: NextRequest, id: string): Promise<NextResponse> {
  return withInternalErrorHandling(async () => {
    const { clientService } = getContainer()
    const result = await clientService.getClient(id)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ client: result.value }))
  })
}
```

- [ ] **Step 4: Write `update-client.controller.ts`**

```ts
// server/clients/http/update-client.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromZod, apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { UpdateClientSchema } from '../dto/client.dto'

export async function updateClientController(req: NextRequest, id: string): Promise<NextResponse> {
  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = UpdateClientSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { clientService } = getContainer()
    const result = await clientService.updateClient(id, parsed.data)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ client: result.value }, 'Client mis à jour'))
  })
}
```

- [ ] **Step 5: Write `deactivate-client.controller.ts`**

```ts
// server/clients/http/deactivate-client.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'

export async function deactivateClientController(req: NextRequest, id: string): Promise<NextResponse> {
  return withInternalErrorHandling(async () => {
    const { clientService } = getContainer()
    const result = await clientService.deactivateClient(id)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess(null, 'Client désactivé'))
  })
}
```

- [ ] **Step 6: Write the failing controller tests**

```ts
// server/clients/http/create-client.controller.test.ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanClientsTable()
})

describe('createClientController', () => {
  it('creates a client and returns 201 with a formatted card number', async () => {
    const res = await createClientController(postRequest({ name: 'Yasmine Kaddour', phone: '+33612345601' }))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data.client.name).toBe('Yasmine Kaddour')
    expect(json.data.client.cardNumber).toMatch(/^CARD-\d{5,}$/)
    expect(json.data.client.cardSequence).toBeUndefined()
  })

  it('returns 400 for an invalid payload', async () => {
    const res = await createClientController(postRequest({ name: '', phone: '123' }))

    expect(res.status).toBe(400)
  })

  it('returns 409 when the phone is already used by an active client', async () => {
    await createClientController(postRequest({ name: 'First', phone: '+33612345601' }))

    const res = await createClientController(postRequest({ name: 'Second', phone: '+33612345601' }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.success).toBe(false)
  })
})
```

```ts
// server/clients/http/get-client.controller.test.ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { getClientController } from './get-client.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest(): NextRequest {
  return new NextRequest('https://example.com/api/clients/x')
}

beforeEach(async () => {
  await cleanClientsTable()
})

describe('getClientController', () => {
  it('returns the client for a valid id', async () => {
    const createRes = await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }))
    const created = (await createRes.json()).data.client

    const res = await getClientController(getRequest(), created.id)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.id).toBe(created.id)
  })

  it('returns 404 for an unknown id', async () => {
    const res = await getClientController(getRequest(), 'does-not-exist')

    expect(res.status).toBe(404)
  })
})
```

```ts
// server/clients/http/update-client.controller.test.ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { updateClientController } from './update-client.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanClientsTable()
})

describe('updateClientController', () => {
  it('updates the client name', async () => {
    const createRes = await createClientController(postRequest({ name: 'Original', phone: '+33612345603' }))
    const created = (await createRes.json()).data.client

    const res = await updateClientController(patchRequest({ name: 'Updated' }), created.id)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.name).toBe('Updated')
  })

  it('returns 404 for an unknown id', async () => {
    const res = await updateClientController(patchRequest({ name: 'X' }), 'does-not-exist')

    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid payload', async () => {
    const createRes = await createClientController(postRequest({ name: 'Valid', phone: '+33612345604' }))
    const created = (await createRes.json()).data.client

    const res = await updateClientController(patchRequest({ name: '' }), created.id)

    expect(res.status).toBe(400)
  })
})
```

```ts
// server/clients/http/deactivate-client.controller.test.ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { deactivateClientController } from './deactivate-client.controller'
import { getClientController } from './get-client.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteRequest(): NextRequest {
  return new NextRequest('https://example.com/api/clients/x', { method: 'DELETE' })
}

beforeEach(async () => {
  await cleanClientsTable()
})

describe('deactivateClientController', () => {
  it('deactivates an existing client', async () => {
    const createRes = await createClientController(postRequest({ name: 'To Deactivate', phone: '+33612345605' }))
    const created = (await createRes.json()).data.client

    const res = await deactivateClientController(deleteRequest(), created.id)

    expect(res.status).toBe(200)

    const getRes = await getClientController(new NextRequest('https://example.com/api/clients/x'), created.id)
    expect(getRes.status).toBe(404)
  })

  it('returns 404 for an unknown id', async () => {
    const res = await deactivateClientController(deleteRequest(), 'does-not-exist')

    expect(res.status).toBe(404)
  })
})
```

```ts
// server/clients/http/list-clients.controller.test.ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { listClientsController } from './list-clients.controller'

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function listRequest(query: string): NextRequest {
  return new NextRequest(`https://example.com/api/clients${query}`)
}

beforeEach(async () => {
  await cleanClientsTable()
})

describe('listClientsController', () => {
  it('returns an empty list with no query params', async () => {
    const res = await listClientsController(listRequest(''))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.clients).toEqual([])
  })

  it('searches by q', async () => {
    await createClientController(postRequest({ name: 'Yasmine Kaddour', phone: '+33612345601' }))

    const res = await listClientsController(listRequest('?q=yasmine'))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
  })

  it('finds by exact phone', async () => {
    await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }))

    const res = await listClientsController(listRequest('?phone=%2B33612345602'))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.clients[0].phone).toBe('+33612345602')
  })

  it('finds by card number', async () => {
    const createRes = await createClientController(postRequest({ name: 'Inès Fabre', phone: '+33612345603' }))
    const created = (await createRes.json()).data.client

    const res = await listClientsController(listRequest(`?cardNumber=${created.cardNumber}`))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.clients[0].id).toBe(created.id)
  })

  it('returns an empty list for a card number that does not exist', async () => {
    const res = await listClientsController(listRequest('?cardNumber=CARD-99999'))
    const json = await res.json()

    expect(json.data.clients).toEqual([])
  })
})
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run server/clients/http/`
Expected: FAIL — cannot find the controller modules (they don't exist yet as files vitest can import, since Steps 1–5 above are written but not yet saved — save them first, then re-run to confirm the *test* failures, not import failures, if any assertion is wrong).

Actually: since Steps 1–5 already wrote the controller implementations inline in this same task, run the tests after Step 5 is saved to disk and confirm they pass directly (there is no separate red phase here because the controllers were written test-informed, not test-first, due to their thin wiring nature — this mirrors how `server/auth/http/*.controller.ts` was built in the Auth module). Skip ahead to Step 8.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run server/clients/http/`
Expected: all 5 controller test files pass (16 tests total across the 5 files).

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 10: Commit**

```bash
git add server/clients/http
git commit -m "feat: add Client HTTP controllers"
```

---

## Task 10: Next.js route handlers

**Files:**
- Create: `app/api/clients/route.ts`
- Create: `app/api/clients/[id]/route.ts`

**Interfaces:**
- Consumes: `listClientsController`, `createClientController` (Task 9), `getClientController`, `updateClientController`, `deactivateClientController` (Task 9).
- Produces: the live `GET /api/clients`, `POST /api/clients`, `GET /api/clients/:id`, `PATCH /api/clients/:id`, `DELETE /api/clients/:id` endpoints.

- [ ] **Step 1: Write `app/api/clients/route.ts`**

```ts
export { listClientsController as GET, createClientController as POST } from '@/server/clients/http/list-clients.controller'
```

Wait — `createClientController` lives in a different file than `listClientsController`. Re-export each from its own module:

```ts
// app/api/clients/route.ts
export { listClientsController as GET } from '@/server/clients/http/list-clients.controller'
export { createClientController as POST } from '@/server/clients/http/create-client.controller'
```

- [ ] **Step 2: Write `app/api/clients/[id]/route.ts`**

Next.js 16 App Router passes route params as the second argument, wrapped in a `{ params: Promise<{ id: string }> }` object — the controllers from Task 9 take a plain `id: string` as their second argument, so each handler here awaits `params` and unwraps it before delegating.

```ts
// app/api/clients/[id]/route.ts
import type { NextRequest } from 'next/server'
import { getClientController } from '@/server/clients/http/get-client.controller'
import { updateClientController } from '@/server/clients/http/update-client.controller'
import { deactivateClientController } from '@/server/clients/http/deactivate-client.controller'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return getClientController(req, id)
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return updateClientController(req, id)
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return deactivateClientController(req, id)
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Start the dev server and verify the routes are live**

Run: `npm run dev` (in the background, or reuse an already-running instance on port 3000 per this project's established workflow — check first with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` before starting a new one).

Then, with the dev server up and the database migrated (Task 1 already applied the migration to the real dev database):

```bash
curl -s -X POST http://localhost:3000/api/clients -H "Content-Type: application/json" -d '{"name":"Live Test","phone":"+33699999901"}'
```
Expected: `{"success":true,"data":{"client":{"id":"...","cardNumber":"CARD-000XX",...}},"message":"Client créé","errors":null}` with HTTP 201.

```bash
curl -s http://localhost:3000/api/clients?q=Live
```
Expected: `{"success":true,"data":{"clients":[{"name":"Live Test",...}]},"errors":null}`.

- [ ] **Step 5: Clean up the live-test row**

The `Live Test` client created in Step 4 is test pollution in the real dev database — deactivate it so it doesn't show up as a phantom client once the frontend is wired up later:

```bash
curl -s -X DELETE http://localhost:3000/api/clients/<id-from-step-4-response>
```

- [ ] **Step 6: Run the full test suite one final time**

Run: `npx vitest run`
Expected: all tests pass (Auth's 116 + all new Client tests from this plan).

- [ ] **Step 7: Commit**

```bash
git add app/api/clients
git commit -m "feat: expose Clients API routes under /api/clients"
```

- [ ] **Step 8: Flag for code review**

This completes the HTTP/routing layer and the module as a whole. Per this project's standing rule, run the code-review skill on the full diff (Tasks 7–10, or the whole branch if not yet reviewed incrementally) before considering this plan done.

---

## Out of scope (confirmed by the design doc, do not implement here)

- Linking a `Client` to a `ClientAccount` (search/validation by phone, manual linking endpoint) — `clientAccountId` exists in the schema but no task above writes to it.
- Frontend integration (`clients-provider.tsx` still reads from mocks after this plan completes) — a separate future plan.
- Pagination on `listClients`/`search`.
- `status` query parameter filtering (depends on the not-yet-real Subscriptions module) — accepted but ignored if passed, per the design doc; no task implements it, and no test asserts it does anything.

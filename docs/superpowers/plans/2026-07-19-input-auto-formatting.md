# Auto-formatage des champs numéro de carte et numéro de téléphone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff/clients type only the significant digits in card-number and phone-number fields — the app reconstructs the full `CARD-<digits>` / E.164 (`+<countryCode><digits>`) value before any API call. The backend contract (`^CARD-(\d+)$`, `/^\+\d{8,15}$/`) is unchanged.

**Architecture:** Two independent, self-contained changes. Card-number formatting lives entirely in `components/scan/client-identification.tsx` (a visual prefix + digit filtering, no new component — only one file uses it). Phone-number formatting is a new shared, controlled component `<PhoneNumberInput>` (`components/ui/phone-number-input.tsx`) that takes/returns the full E.164 string exactly like a plain `<Input>` — every consuming form's state/validation/submit logic is untouched, only the rendered field changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4. No test framework in this repo — verify with `tsc --noEmit` and manual verification via the dev server (`superpowers:verify`/`run` conventions already used in this project).

## Global Constraints

- **The backend contract does not change** — this plan touches ONLY frontend files (`components/`, `app/`). Nothing under `server/`, `app/api/`, or `prisma/` is modified. `format-card-number.ts`'s `^CARD-(\d+)$` and `client-otp.dto.ts`/`client.dto.ts`'s `/^\+\d{8,15}$/` stay exactly as they are — the frontend reconstructs a value that already satisfies these patterns.
- **Supported country codes are exactly `+221` (Sénégal) and `+33` (France)**, with `+221` as the default/pre-selected indicatif on every phone field. No other country codes, no per-country local-number length validation — the existing overall `/^\+\d{8,15}$/` regex remains the only validation, on every form that already validates.
- **`<PhoneNumberInput>` is a controlled component**: `value`/`onChange` are always the full E.164 string, exactly like `<Input>`. Consuming forms (`client-form.tsx`, `app/connexion/page.tsx`, `visitor-session-form.tsx`) change ONLY their rendered field — their state variables, validation functions, and submit handlers keep working on a plain string, unchanged in shape.
- **`components/sessions/client-search.tsx` and the search bar in `app/(staff)/clients/page.tsx` are explicitly out of scope** — free-text search fields (name OR phone), not strict single-value phone inputs. Do not touch them.
- **Client creation never involves typing a card number** — it's server-generated. Only `components/scan/client-identification.tsx` (the session check-in identification flow) is touched for card-number formatting.
- **`visitor-session-form.tsx` gains new E.164 validation** (it currently has none beyond "non-empty") as an explicit, deliberate scope decision — even though session recording is still backend-mocked (no real API call yet for this specific form), consistency with the other 3 forms and readiness for the future staff-CRUD backend work outweigh strict minimalism here.
- Every file this plan modifies currently exists and is shipped on `main` — read each file's current content before editing (code blocks below are accurate as of plan-writing time; re-verify, since a separate backend-focused agent may land concurrent commits in this shared repo — check `git log --oneline -3 -- <file>` before editing if in doubt).
- French UI copy throughout, consistent with the rest of the app.
- Follow the existing `components/ui/` primitive conventions: `Input`/`Label` from `components/ui/input.tsx`, `cn()` from `@/lib/utils` for className merging, `'use client'` directive where hooks are used — see `components/ui/password-input.tsx` for the established pattern of composing a new input primitive on top of `Input`.

---

## File Structure

```
components/ui/phone-number-input.tsx        — CREATE: shared <PhoneNumberInput> (indicatif select + local-digits Input, E.164 value/onChange)
components/clients/client-form.tsx          — MODIFY: swap phone <Input> for <PhoneNumberInput>
app/connexion/page.tsx                       — MODIFY: swap phone <Input> for <PhoneNumberInput>
components/sessions/visitor-session-form.tsx — MODIFY: swap phone <Input> for <PhoneNumberInput>, add E.164 validation
components/scan/client-identification.tsx    — MODIFY: CARD- prefix + digit-only filtering on both card-number fields
```

---

## Task 1: `<PhoneNumberInput>` shared component

**Files:**
- Create: `components/ui/phone-number-input.tsx`

**Interfaces:**
- Consumes: `Input` from `./input` (`components/ui/input.tsx`), `cn` from `@/lib/utils`.
- Produces:
  ```typescript
  export function PhoneNumberInput({
    id,
    value,
    onChange,
    placeholder,
  }: {
    id?: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
  }): JSX.Element
  ```
  Consumed by Tasks 2 and 3 (`client-form.tsx`, `app/connexion/page.tsx`, `visitor-session-form.tsx`).

- [ ] **Step 1: Write `components/ui/phone-number-input.tsx`**

```typescript
// components/ui/phone-number-input.tsx
'use client'

import { Input } from './input'

const COUNTRY_CODES = [
  { code: '+221', label: '🇸🇳 +221' },
  { code: '+33', label: '🇫🇷 +33' },
] as const

const DEFAULT_COUNTRY_CODE = '+221'

function splitPhoneValue(value: string): { countryCode: string; localNumber: string } {
  const match = COUNTRY_CODES.find((c) => value.startsWith(c.code))
  if (match) {
    return { countryCode: match.code, localNumber: value.slice(match.code.length) }
  }
  return { countryCode: DEFAULT_COUNTRY_CODE, localNumber: '' }
}

export function PhoneNumberInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const { countryCode, localNumber } = splitPhoneValue(value)

  const handleCountryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(`${event.target.value}${localNumber}`)
  }

  const handleLocalNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = event.target.value.replace(/\D/g, '')
    onChange(`${countryCode}${digitsOnly}`)
  }

  return (
    <div className="flex gap-2">
      <select
        aria-label="Indicatif pays"
        value={countryCode}
        onChange={handleCountryChange}
        className="flex h-10 shrink-0 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
      <Input
        id={id}
        type="tel"
        value={localNumber}
        onChange={handleLocalNumberChange}
        placeholder={placeholder}
      />
    </div>
  )
}
```

Note `splitPhoneValue` is a pure function of `value` — no `useEffect`/`useState` synchronization needed, matching the design doc's "dérivation pure à chaque appel" decision. When `value` doesn't start with a known country code (empty string on creation, or an unrecognized prefix on existing data), it falls back to `{ countryCode: DEFAULT_COUNTRY_CODE, localNumber: '' }` — never throws, never silently drops the original `value` (the parent still holds it until the user actually types).

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors in `components/ui/phone-number-input.tsx`. This file has no consumers yet, so no other errors should appear from this change.

- [ ] **Step 3: Commit**

```bash
git add components/ui/phone-number-input.tsx
git commit -m "feat: add PhoneNumberInput component with indicatif selector"
```

---

## Task 2: Wire `<PhoneNumberInput>` into `client-form.tsx` and `app/connexion/page.tsx`

**Files:**
- Modify: `components/clients/client-form.tsx`
- Modify: `app/connexion/page.tsx`

**Interfaces:**
- Consumes: `PhoneNumberInput` (Task 1).

Both are simple field swaps — no state, validation, or submit-handler changes in either file.

- [ ] **Step 1: Update `components/clients/client-form.tsx`**

Current content (verify this matches before editing):

```typescript
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-phone">Téléphone</Label>
        <Input
          id="client-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+33612345678"
        />
        {errors.phone && (
          <p role="alert" className="text-sm text-destructive">
            {errors.phone}
          </p>
        )}
      </div>
```

New content:

```typescript
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-phone">Téléphone</Label>
        <PhoneNumberInput id="client-phone" value={phone} onChange={setPhone} placeholder="771234567" />
        {errors.phone && (
          <p role="alert" className="text-sm text-destructive">
            {errors.phone}
          </p>
        )}
      </div>
```

Add the import (alongside the existing `Input, Label` import):

```typescript
import { Input, Label } from '@/components/ui/input'
import { PhoneNumberInput } from '@/components/ui/phone-number-input'
```

Nothing else in this file changes — `phone` state, `validate()`'s `/^\+\d{8,15}$/` check, and `handleSubmit`'s `phone: phone.trim()` all keep operating on the same plain string, now supplied by `PhoneNumberInput` instead of a raw `<Input>`.

- [ ] **Step 2: Update `app/connexion/page.tsx`**

Current content (verify this matches before editing):

```typescript
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Numéro de téléphone</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33612345601"
              />
            </div>
```

New content:

```typescript
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Numéro de téléphone</Label>
              <PhoneNumberInput id="phone" value={phone} onChange={setPhone} placeholder="612345601" />
            </div>
```

Add the import:

```typescript
import { Input, Label } from '@/components/ui/input'
import { PhoneNumberInput } from '@/components/ui/phone-number-input'
```

If `Input` becomes unused in this file after the swap (check the rest of the file — this page only has the one phone field), remove the now-unused `Input` import to keep `tsc`/lint clean; keep `Label` since it's still used.

Nothing else changes — `phone` state and `requestClientOtp(phone)` keep operating on the same plain string.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Manual verification**

Run the dev server (`superpowers:run` or `pnpm dev` against a running Postgres). On `/connexion`: confirm `+221` is pre-selected, typing digits builds a number, switching to `+33` keeps the typed digits and only changes the prefix, and submitting a valid reconstructed number still reaches `requestClientOtp` correctly (e.g. via a seeded client phone number). On the staff `/clients` "Ajouter un client" dialog: same checks, plus confirm the existing phone-validation error message still appears for an incomplete number.

- [ ] **Step 5: Commit**

```bash
git add components/clients/client-form.tsx "app/connexion/page.tsx"
git commit -m "feat: wire PhoneNumberInput into client creation/edit and client login"
```

---

## Task 3: Wire `<PhoneNumberInput>` into `visitor-session-form.tsx`, add E.164 validation

**Files:**
- Modify: `components/sessions/visitor-session-form.tsx`

**Interfaces:**
- Consumes: `PhoneNumberInput` (Task 1).

This form currently has NO phone-format validation (only a "non-empty" check shared with the name field). This task adds the same `/^\+\d{8,15}$/` validation already used in `client-form.tsx`, with its own error message, alongside the field swap.

- [ ] **Step 1: Rewrite `components/sessions/visitor-session-form.tsx`**

Current content (verify this matches before editing — full file, 71 lines):

```typescript
'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { PaymentMethodPicker } from './payment-method-picker'
import type { PaymentMethod } from '@/lib/subscriptions/types'

export function VisitorSessionForm({
  onSubmit,
  onCancel,
  submitLabel,
}: {
  onSubmit: (values: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (fullName.trim().length === 0 || phoneNumber.trim().length === 0) {
      setError('Le nom et le téléphone sont obligatoires.')
      return
    }
    setError(null)
    onSubmit({ fullName: fullName.trim(), phoneNumber: phoneNumber.trim(), paymentMethod })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="visitor-full-name">Nom complet</Label>
        <Input
          id="visitor-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nom et prénom"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="visitor-phone">Téléphone</Label>
        <Input
          id="visitor-phone"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+33…"
        />
      </div>
      <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" className="bg-gradient-brand text-primary-foreground">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
```

New content:

```typescript
'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { PhoneNumberInput } from '@/components/ui/phone-number-input'
import { PaymentMethodPicker } from './payment-method-picker'
import type { PaymentMethod } from '@/lib/subscriptions/types'

export function VisitorSessionForm({
  onSubmit,
  onCancel,
  submitLabel,
}: {
  onSubmit: (values: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (fullName.trim().length === 0 || phoneNumber.trim().length === 0) {
      setError('Le nom et le téléphone sont obligatoires.')
      return
    }
    if (!/^\+\d{8,15}$/.test(phoneNumber.trim())) {
      setError('Numéro de téléphone invalide.')
      return
    }
    setError(null)
    onSubmit({ fullName: fullName.trim(), phoneNumber: phoneNumber.trim(), paymentMethod })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="visitor-full-name">Nom complet</Label>
        <Input
          id="visitor-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nom et prénom"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="visitor-phone">Téléphone</Label>
        <PhoneNumberInput id="visitor-phone" value={phoneNumber} onChange={setPhoneNumber} placeholder="771234567" />
      </div>
      <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" className="bg-gradient-brand text-primary-foreground">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
```

The single `error` state now serves two distinct messages (empty-fields vs. invalid-phone-format), exactly mirroring how `client-form.tsx`'s `errors.phone` is a single slot for whatever phone-related problem applies — no new state variable needed.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Manual verification**

Run the dev server. On `/seances`, open "Enregistrer une visite" (or the equivalent visitor-session entry point): confirm `+221` is pre-selected, submitting with an empty phone still shows "Le nom et le téléphone sont obligatoires.", and submitting with a phone that's too short (e.g. only 2-3 digits typed) shows "Numéro de téléphone invalide." instead of silently succeeding.

- [ ] **Step 4: Commit**

```bash
git add components/sessions/visitor-session-form.tsx
git commit -m "feat: wire PhoneNumberInput into visitor session form, add E.164 validation"
```

---

## Task 4: Card-number auto-formatting in `client-identification.tsx`

**Files:**
- Modify: `components/scan/client-identification.tsx`

**Interfaces:**
- Produces: no external interface change — `ClientIdentification`'s props (`{ clientRepository, onIdentified }`) and behavior from the caller's perspective are unchanged, only the card-number entry UI and the value sent to `resolveCardNumber` change internally.

- [ ] **Step 1: Update `components/scan/client-identification.tsx`**

Current content (verify this matches before editing — full file, 155 lines, reproduced here since every change is small but touches several non-adjacent spots):

```typescript
// components/scan/client-identification.tsx
'use client'

import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { ClientSearch } from '@/components/sessions/client-search'
import { QrScanner, type QrScannerError, type QrScannerHandle } from '@/components/scan/qr-scanner'
import type { Client } from '@/lib/clients/types'
import type { AsyncClientRepository } from '@/lib/clients/repository'

type IdentificationMethod = 'qr' | 'card-number' | 'search'

const METHOD_LABELS: { value: IdentificationMethod; label: string }[] = [
  { value: 'qr', label: 'QR code' },
  { value: 'card-number', label: 'Numéro de carte' },
  { value: 'search', label: 'Nom / téléphone' },
]

export function ClientIdentification({
  clientRepository,
  onIdentified,
}: {
  clientRepository: AsyncClientRepository
  onIdentified: (client: Client) => void
}) {
  const [method, setMethod] = useState<IdentificationMethod>('qr')
  const [cardNumberInput, setCardNumberInput] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [cameraFallback, setCameraFallback] = useState(false)
  const scannerRef = useRef<QrScannerHandle>(null)
  const requestIdRef = useRef(0)

  const resolveCardNumber = useCallback(
    async (cardNumber: string) => {
      const requestId = ++requestIdRef.current
      try {
        const client = await clientRepository.findByCardNumber(cardNumber)
        if (requestIdRef.current !== requestId) return // a newer request superseded this one
        if (client) {
          setNotFound(false)
          setSearchError(false)
          onIdentified(client)
        } else {
          setNotFound(true)
          setSearchError(false)
          scannerRef.current?.reset()
        }
      } catch {
        if (requestIdRef.current !== requestId) return // a newer request superseded this one
        setNotFound(false)
        setSearchError(true)
        scannerRef.current?.reset()
      }
    },
    [clientRepository, onIdentified],
  )

  // Memoized: QrScanner's internal effect re-runs (tearing down and reacquiring the
  // camera) whenever onDetect/onError change identity, so these must stay stable
  // across renders rather than being passed as fresh inline arrow functions.
  const handleQrDetect = useCallback(
    (value: string) => {
      // A decoded QR that doesn't match any known cardNumber is a normal "not found"
      // outcome determined here, not a QrScanner error.
      resolveCardNumber(value)
    },
    [resolveCardNumber],
  )

  const handleQrError = useCallback((error: QrScannerError) => {
    if (error === 'permission-denied' || error === 'no-camera' || error === 'unsupported') {
      setCameraFallback(true)
    }
    // 'unreadable' is a transient, expected state while positioning the camera — no action.
  }, [])

  const handleCardNumberSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resolveCardNumber(cardNumberInput)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {METHOD_LABELS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMethod(m.value)}
            className={
              method === m.value
                ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted'
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {method === 'qr' &&
        (cameraFallback ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Caméra indisponible. Saisissez le numéro de carte.
            </p>
            <form className="flex gap-2" onSubmit={handleCardNumberSubmit}>
              <Input
                value={cardNumberInput}
                onChange={(e) => setCardNumberInput(e.target.value)}
                placeholder="CARD-00001"
                autoFocus
              />
              <Button type="submit">Valider</Button>
            </form>
          </div>
        ) : (
          <QrScanner ref={scannerRef} active={method === 'qr'} onDetect={handleQrDetect} onError={handleQrError} />
        ))}

      {method === 'card-number' && (
        <form className="flex flex-col gap-1.5" onSubmit={handleCardNumberSubmit}>
          <Label htmlFor="card-number-input">Numéro de carte</Label>
          <div className="flex gap-2">
            <Input
              id="card-number-input"
              value={cardNumberInput}
              onChange={(e) => setCardNumberInput(e.target.value)}
              placeholder="CARD-00001"
              autoFocus
            />
            <Button type="submit">Valider</Button>
          </div>
        </form>
      )}

      {method === 'search' && <ClientSearch clientRepository={clientRepository} onSelect={onIdentified} />}

      {notFound && (
        <p role="alert" className="text-sm text-destructive">
          Carte non reconnue.
        </p>
      )}

      {searchError && (
        <p role="alert" className="text-sm text-destructive">
          Erreur de recherche, réessayez.
        </p>
      )}
    </div>
  )
}
```

Apply these targeted changes:

**1. Add a digit-filtering handler and update `handleCardNumberSubmit` to reconstruct the full card number.** Find:

```typescript
  const handleCardNumberSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resolveCardNumber(cardNumberInput)
  }
```

Replace with:

```typescript
  const handleCardNumberDigitsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCardNumberInput(event.target.value.replace(/\D/g, ''))
  }

  const handleCardNumberSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resolveCardNumber(`CARD-${cardNumberInput}`)
  }
```

**2. Replace the QR-fallback card-number field** (prefix + digit-only input + disabled-when-empty submit). Find:

```typescript
            <form className="flex gap-2" onSubmit={handleCardNumberSubmit}>
              <Input
                value={cardNumberInput}
                onChange={(e) => setCardNumberInput(e.target.value)}
                placeholder="CARD-00001"
                autoFocus
              />
              <Button type="submit">Valider</Button>
            </form>
```

Replace with:

```typescript
            <form className="flex gap-2" onSubmit={handleCardNumberSubmit}>
              <div className="flex flex-1 items-stretch">
                <span className="flex items-center rounded-l-lg border border-r-0 border-border bg-muted px-3 text-sm text-muted-foreground">
                  CARD-
                </span>
                <Input
                  value={cardNumberInput}
                  onChange={handleCardNumberDigitsChange}
                  placeholder="00001"
                  autoFocus
                  className="rounded-l-none"
                />
              </div>
              <Button type="submit" disabled={cardNumberInput.length === 0}>
                Valider
              </Button>
            </form>
```

**3. Replace the dedicated "Numéro de carte" tab's field** — same prefix/filtering/disabled treatment. Find:

```typescript
          <div className="flex gap-2">
            <Input
              id="card-number-input"
              value={cardNumberInput}
              onChange={(e) => setCardNumberInput(e.target.value)}
              placeholder="CARD-00001"
              autoFocus
            />
            <Button type="submit">Valider</Button>
          </div>
```

Replace with:

```typescript
          <div className="flex gap-2">
            <div className="flex flex-1 items-stretch">
              <span className="flex items-center rounded-l-lg border border-r-0 border-border bg-muted px-3 text-sm text-muted-foreground">
                CARD-
              </span>
              <Input
                id="card-number-input"
                value={cardNumberInput}
                onChange={handleCardNumberDigitsChange}
                placeholder="00001"
                autoFocus
                className="rounded-l-none"
              />
            </div>
            <Button type="submit" disabled={cardNumberInput.length === 0}>
              Valider
            </Button>
          </div>
```

Both card-number fields now share `handleCardNumberDigitsChange` (digit-only filtering) and both submit buttons are disabled while `cardNumberInput` is empty, preventing a bare `CARD-` (no digits) from ever being sent — `^CARD-(\d+)$` requires at least one digit. `resolveCardNumber`'s own signature, `useCallback` dependency array, the QR-detection path (`handleQrDetect`, which calls `resolveCardNumber(value)` directly with a full decoded QR value — QR codes already encode the complete `CARD-xxxxx` string, untouched by this change), and the `notFound`/`searchError` display logic are all unchanged.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Manual verification**

Run the dev server. On `/seances`, open the client-identification flow used for check-in: on the QR-camera-unavailable fallback and the dedicated "Numéro de carte" tab, confirm the `CARD-` prefix renders as a fixed, non-editable label; confirm typing non-digit characters (letters, spaces) is silently ignored; confirm the "Valider" button is disabled with zero digits typed and enables once at least one digit is entered; confirm submitting a real seeded client's card-number digits (e.g. `00001`) successfully identifies them; confirm submitting an unknown digit sequence still shows "Carte non reconnue." Confirm the QR-scanning path itself (if a camera is available) is unaffected — scanning a real QR code should still work exactly as before, since `handleQrDetect` doesn't go through the new digit-only field at all.

- [ ] **Step 4: Commit**

```bash
git add components/scan/client-identification.tsx
git commit -m "feat: auto-format card-number field with a fixed CARD- prefix"
```

---

## Task 5: Final regression pass

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project. If `npx tsc` behaves suspiciously (no output when errors were expected, or a visible error banner despite exit 0), fall back to `node "node_modules/.pnpm/typescript@<version>/node_modules/typescript/bin/tsc" --noEmit` (check the exact version via `ls node_modules/.pnpm | grep typescript` first) — this project's `npx` binary resolution has been unreliable in past sessions.

- [ ] **Step 2: Production build**

Run: `pnpm build` (or `npx next build`)
Expected: build succeeds, all routes generated.

- [ ] **Step 3: Constraint audit**

- Confirm no file under `server/`, `app/api/`, or `prisma/` appears in `git diff --name-only <baseline>..HEAD` for this plan's commits (baseline = the commit before Task 1).
- Grep for any remaining raw `<Input type="tel">`/`<Input>` phone fields in `client-form.tsx`, `app/connexion/page.tsx`, `visitor-session-form.tsx` that should have been replaced by `<PhoneNumberInput>` — `grep -rn "PhoneNumberInput" components/ app/` should show exactly 4 usages (the component's own file doesn't count as a usage — 3 consuming forms).
- Confirm `components/sessions/client-search.tsx` and `app/(staff)/clients/page.tsx`'s search bar were NOT touched by this plan (`git diff --name-only <baseline>..HEAD` should not list either file).

- [ ] **Step 4: Manual smoke test of adjacent, untouched features**

Verify `/clients`, `/clients/[id]`, `/abonnements`, `/scan` (QR-only path), and the client portal (`/connexion` → OTP verification → `/accueil`) all still work end-to-end — this plan only changes how 2 field types are entered, never their downstream validation, submission, or API contracts.

- [ ] **Step 5: Commit** (only if Steps 1-4 required fixes; otherwise skip — no empty commit)

```bash
git add -A
git commit -m "fix: address regressions found in input auto-formatting regression pass"
```

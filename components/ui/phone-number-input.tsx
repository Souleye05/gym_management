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

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

  const handleCardNumberDigitsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCardNumberInput(event.target.value.replace(/\D/g, ''))
  }

  const handleCardNumberSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resolveCardNumber(`CARD-${cardNumberInput}`)
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
          </div>
        ) : (
          <QrScanner ref={scannerRef} active={method === 'qr'} onDetect={handleQrDetect} onError={handleQrError} />
        ))}

      {method === 'card-number' && (
        <form className="flex flex-col gap-1.5" onSubmit={handleCardNumberSubmit}>
          <Label htmlFor="card-number-input">Numéro de carte</Label>
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

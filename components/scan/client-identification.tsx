// components/scan/client-identification.tsx
'use client'

import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { ClientSearch } from '@/components/sessions/client-search'
import { QrScanner, type QrScannerError, type QrScannerHandle } from '@/components/scan/qr-scanner'
import type { Client } from '@/lib/clients/types'
import type { ClientRepository } from '@/lib/clients/repository'

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
  clientRepository: ClientRepository
  onIdentified: (client: Client) => void
}) {
  const [method, setMethod] = useState<IdentificationMethod>('qr')
  const [cardNumberInput, setCardNumberInput] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [cameraFallback, setCameraFallback] = useState(false)
  const scannerRef = useRef<QrScannerHandle>(null)

  const resolveCardNumber = useCallback(
    (cardNumber: string) => {
      const client = clientRepository.findByCardNumber(cardNumber)
      if (client) {
        setNotFound(false)
        onIdentified(client)
      } else {
        setNotFound(true)
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
    </div>
  )
}

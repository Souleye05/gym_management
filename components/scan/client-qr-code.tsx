// components/scan/client-qr-code.tsx
'use client'

import QRCode from 'qrcode'
import { useEffect, useRef } from 'react'

export function ClientQrCode({ cardNumber }: { cardNumber: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, cardNumber, { width: 96, margin: 1 })
    }
  }, [cardNumber])

  return (
    <div className="flex flex-col items-center gap-1">
      <canvas ref={canvasRef} className="rounded-lg" />
      <span className="text-xs text-muted-foreground">{cardNumber}</span>
    </div>
  )
}

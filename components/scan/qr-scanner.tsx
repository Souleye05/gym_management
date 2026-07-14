// components/scan/qr-scanner.tsx
'use client'

import jsQR from 'jsqr'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export type QrScannerError = 'permission-denied' | 'no-camera' | 'unsupported' | 'unreadable'

export type QrScannerHandle = {
  reset: () => void
}

type QrScannerProps = {
  active: boolean
  onDetect: (value: string) => void
  onError?: (error: QrScannerError) => void
}

export const QrScanner = forwardRef<QrScannerHandle, QrScannerProps>(function QrScanner(
  { active, onDetect, onError },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectedRef = useRef(false)

  useImperativeHandle(ref, () => ({
    reset: () => {
      detectedRef.current = false
    },
  }))

  useEffect(() => {
    if (!active) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError?.('unsupported')
      return
    }

    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
        const tick = () => {
          const video = videoRef.current
          const canvas = canvasRef.current
          if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
            rafRef.current = requestAnimationFrame(tick)
            return
          }
          const context = canvas.getContext('2d')
          if (!context) {
            rafRef.current = requestAnimationFrame(tick)
            return
          }
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          context.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          if (code && !detectedRef.current) {
            detectedRef.current = true
            onDetect(code.data)
          } else if (!code) {
            onError?.('unreadable')
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      })
      .catch((err: DOMException) => {
        if (cancelled) return
        onError?.(err.name === 'NotAllowedError' ? 'permission-denied' : 'no-camera')
      })

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [active, onDetect, onError])

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} className="size-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
})

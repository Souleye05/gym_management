'use client'

import { animate, useInView } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

export function AnimatedNumber({
  value,
  format = 'number',
}: {
  value: number
  format?: 'number' | 'currency'
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(latest),
    })
    return () => controls.stop()
  }, [inView, value])

  const formatted =
    format === 'currency'
      ? new Intl.NumberFormat('fr-FR', {
          style: 'currency',
          currency: 'EUR',
          maximumFractionDigits: 0,
        }).format(display)
      : new Intl.NumberFormat('fr-FR').format(Math.round(display))

  return <span ref={ref}>{formatted}</span>
}

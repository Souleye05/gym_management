const CARD_NUMBER_PATTERN = /^CARD-(\d+)$/

export function formatCardNumber(sequence: number): string {
  return `CARD-${String(sequence).padStart(5, '0')}`
}

export function parseCardNumber(cardNumber: string): number | null {
  const match = CARD_NUMBER_PATTERN.exec(cardNumber)
  if (!match) return null
  return Number(match[1])
}

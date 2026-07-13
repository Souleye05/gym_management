import type { Session } from './types'

function hoursFromNow(hours: number): string {
  const date = new Date()
  date.setUTCHours(date.getUTCHours() + hours)
  return date.toISOString()
}

export const mockSessions: Session[] = [
  { id: 'sess1', clientId: 'cl3', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-2) },
  { id: 'sess2', clientId: 'cl7', amountPaid: 8, paymentMethod: 'card', checkedInAt: hoursFromNow(-1) },
  { id: 'sess3', clientId: 'cl12', amountPaid: 8, paymentMethod: 'mobile_money', checkedInAt: hoursFromNow(-0.5) },
  { id: 'sess4', clientId: 'cl1', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-30) },
  { id: 'sess5', clientId: 'cl3', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-54) },
]

import type { Session } from './types'

function hoursFromNow(hours: number): string {
  const date = new Date()
  date.setUTCHours(date.getUTCHours() + hours)
  return date.toISOString()
}

export const mockSessions: Session[] = [
  { type: 'subscriber', id: 'sess1', clientId: 'cl3', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-2) },
  { type: 'subscriber', id: 'sess2', clientId: 'cl7', amountPaid: 8, paymentMethod: 'card', checkedInAt: hoursFromNow(-1) },
  { type: 'subscriber', id: 'sess3', clientId: 'cl12', amountPaid: 8, paymentMethod: 'mobile_money', checkedInAt: hoursFromNow(-0.5) },
  { type: 'subscriber', id: 'sess4', clientId: 'cl1', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-30) },
  { type: 'subscriber', id: 'sess5', clientId: 'cl3', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-54) },
  { type: 'visitor', id: 'sess6', fullName: 'Nadia Ferrand', phoneNumber: '+33698765432', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-3) },
  { type: 'visitor', id: 'sess7', fullName: 'Julien Roche', phoneNumber: '+33687654321', amountPaid: 8, paymentMethod: 'card', checkedInAt: hoursFromNow(-40) },
]

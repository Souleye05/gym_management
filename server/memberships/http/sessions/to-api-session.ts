import type { PaymentMethod, Session } from '../../domain/entities'

const PAYMENT_METHOD_MAP: Record<PaymentMethod, string> = {
  CASH: 'cash',
  CARD: 'card',
  MOBILE_MONEY: 'mobile_money',
}

export function toApiSession(session: Session) {
  return {
    id: session.id,
    type: session.type === 'SUBSCRIBER' ? ('subscriber' as const) : ('visitor' as const),
    clientId: session.clientId,
    fullName: session.visitorName,
    phoneNumber: session.visitorPhone,
    amountPaid: session.amountPaid,
    paymentMethod: PAYMENT_METHOD_MAP[session.paymentMethod],
    checkedInAt: session.checkedInAt,
  }
}

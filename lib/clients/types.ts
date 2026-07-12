export type ClientStatus = 'active' | 'expiring' | 'expired' | 'none'

export type Client = {
  id: string
  name: string
  phone: string
  email?: string
  cardNumber: string
  status: ClientStatus
  joinedAt: string
}

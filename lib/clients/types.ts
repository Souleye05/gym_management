export type ClientStatus = 'active' | 'expiring' | 'expired' | 'suspended' | 'none'

export type Client = {
  id: string
  name: string
  phone: string
  email?: string
  cardNumber: string
  joinedAt: string
}

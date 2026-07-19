export type ClientStatus = 'active' | 'expiring' | 'expired' | 'suspended' | 'none'

export type Client = {
  id: string
  name: string
  phone: string
  email: string | null
  cardNumber: string
  joinedAt: string
  isActive: boolean
}

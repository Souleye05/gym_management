export type ClientAccountRecord = {
  id: string
  phone: string
  name: string
  isActive: boolean
}

export interface ClientAccountRepository {
  findByPhone(phone: string): Promise<ClientAccountRecord | null>
  findById(id: string): Promise<ClientAccountRecord | null>
}

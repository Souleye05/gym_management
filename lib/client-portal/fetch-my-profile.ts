import type { MyProfile } from './types'

type RealClient = {
  id: string
  cardNumber: string
  name: string
  phone: string
  email: string | null
  isActive: boolean
  joinedAt: string
}

type ApiEnvelope<T> =
  | { success: true; data: T; message: string; errors: null }
  | { success: false; data: null; message: string; errors: { field: string; message: string }[] | null }

export type FetchMyProfileResult =
  | { kind: 'found'; client: MyProfile['client'] }
  | { kind: 'not-linked' }

function toReducedClient(client: RealClient): MyProfile['client'] {
  return {
    name: client.name,
    phone: client.phone,
    cardNumber: client.cardNumber,
  }
}

export async function fetchMyClientProfile(): Promise<FetchMyProfileResult> {
  const response = await fetch('/api/client/me/profile')
  const envelope: ApiEnvelope<{ client: RealClient | null }> = await response.json()

  if (!envelope.success) {
    throw new Error(envelope.message || 'Impossible de charger votre profil.')
  }

  if (envelope.data.client === null) {
    return { kind: 'not-linked' }
  }

  return { kind: 'found', client: toReducedClient(envelope.data.client) }
}

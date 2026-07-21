import type { Client } from './types'

type ApiEnvelope<T> =
  | { success: true; data: T; message: string; errors: null }
  | { success: false; data: null; message: string; errors: { field: string; message: string }[] | null }

export type ListClientsParams = { q?: string; page?: number; limit?: number }
export type ListClientsResult = { clients: Client[]; total?: number }
export type NewClientInput = { name: string; phone: string; email?: string }
export type UpdateClientInput = Partial<Pick<Client, 'name' | 'phone' | 'email'>>

async function unwrap<T>(response: Response, fallbackMessage: string): Promise<T> {
  let envelope: ApiEnvelope<T>
  try {
    envelope = await response.json()
  } catch {
    throw new Error(fallbackMessage)
  }
  if (!envelope.success) {
    throw new Error(envelope.message || fallbackMessage)
  }
  return envelope.data
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  }
  const qs = searchParams.toString()
  return qs.length > 0 ? `?${qs}` : ''
}

export async function fetchClients(params: ListClientsParams): Promise<ListClientsResult> {
  const response = await fetch(`/api/clients${buildQuery(params)}`)
  return unwrap<ListClientsResult>(response, 'Impossible de charger la liste des clients.')
}

export async function createClientRequest(input: NewClientInput): Promise<Client> {
  const response = await fetch('/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await unwrap<{ client: Client }>(response, "Impossible de créer le client.")
  return data.client
}

export async function updateClientRequest(id: string, input: UpdateClientInput): Promise<Client> {
  const response = await fetch(`/api/clients/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await unwrap<{ client: Client }>(response, 'Impossible de modifier le client.')
  return data.client
}

export async function deactivateClientRequest(id: string): Promise<void> {
  const response = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
  await unwrap<unknown>(response, 'Impossible de désactiver le client.')
}

export async function findClientByCardNumberRequest(cardNumber: string): Promise<Client | undefined> {
  const response = await fetch(`/api/clients?cardNumber=${encodeURIComponent(cardNumber)}`)
  const data = await unwrap<ListClientsResult>(response, 'Impossible de rechercher le client.')
  return data.clients[0]
}

/**
 * Fallback single-client lookup used when a client isn't present in the (paginated, active-only)
 * in-memory clients list — e.g. an active client beyond the first page, or a deactivated client
 * (always requests `includeInactive=true`, since every current caller needs to resolve a
 * deactivated client's details, never just confirm they're gone). Unlike the other request
 * helpers, this treats a failed envelope (including a genuine 404 "not found") as an expected,
 * non-exceptional `undefined` result rather than throwing, since callers use this purely to
 * double-check before concluding a client truly doesn't exist.
 */
export async function getClientByIdRequest(id: string): Promise<Client | undefined> {
  const response = await fetch(`/api/clients/${id}?includeInactive=true`)
  let envelope: ApiEnvelope<{ client: Client }>
  try {
    envelope = await response.json()
  } catch {
    return undefined
  }
  return envelope.success ? envelope.data.client : undefined
}

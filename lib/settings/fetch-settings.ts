import type { AppSettings } from './types'

type ApiEnvelope<T> =
  | { success: true; data: T; message: string; errors: null }
  | { success: false; data: null; message: string; errors: { field: string; message: string }[] | null }

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

export async function fetchSettings(): Promise<AppSettings> {
  const response = await fetch('/api/settings')
  const data = await unwrap<{ settings: AppSettings }>(response, 'Impossible de charger les paramètres.')
  return data.settings
}

export async function updateSettingsRequest(input: { sessionPrice: number }): Promise<AppSettings> {
  const response = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await unwrap<{ settings: AppSettings }>(response, 'Impossible de mettre à jour les paramètres.')
  return data.settings
}

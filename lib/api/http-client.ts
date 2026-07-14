// lib/api/http-client.ts
// Mirrors server/shared/api-response.ts's envelope shape. Kept as an independent copy rather than
// importing from server/ — this file ships to the browser and server/ is treated as a server-only
// zone in this codebase (its sibling files pull in next/server). Keep both in sync by hand.
export type ApiSuccess<T> = { success: true; data: T; message: string; errors: null }
export type ApiFailure = { success: false; data: null; message: string; errors: { field: string; message: string }[] | null }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export type ApiRequestError = {
  message: string
  status: number
  errors: { field: string; message: string }[] | null
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiRequestError }

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    return {
      ok: false,
      error: { message: 'Impossible de contacter le serveur. Vérifiez votre connexion.', status: 0, errors: null },
    }
  }

  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null
  if (!body) {
    return { ok: false, error: { message: 'Réponse invalide du serveur.', status: response.status, errors: null } }
  }
  if (!body.success) {
    return { ok: false, error: { message: body.message, status: response.status, errors: body.errors } }
  }
  return { ok: true, value: body.data }
}

export const httpClient = {
  get<T>(path: string): Promise<ApiResult<T>> {
    return request<T>(path, { method: 'GET' })
  },
  post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined })
  },
}

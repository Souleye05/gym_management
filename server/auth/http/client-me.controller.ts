import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { requireClientAuth } from './require-client-auth'

export async function clientMeController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireClientAuth(req)
  if (!auth.ok) return auth.response

  return NextResponse.json(apiSuccess({ user: auth.client }))
}

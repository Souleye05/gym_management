import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { requireStaffAuth } from './require-staff-auth'

export async function staffMeController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return NextResponse.json(apiSuccess({ user: auth.staff }))
}

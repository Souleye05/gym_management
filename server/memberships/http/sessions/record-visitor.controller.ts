import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromZod, apiSuccess } from '../../../shared/api-response'
import { getContainer } from '../../../shared/container'
import { withInternalErrorHandling } from '../../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../../auth/http/require-staff-auth'
import { RecordVisitorSessionSchema } from '../../dto/session.dto'
import { apiFailureFromMembershipDomainError, statusForMembershipDomainError } from '../membership-api-response'
import { toApiSession } from './to-api-session'

export async function recordVisitorSessionController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = RecordVisitorSessionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { staffSessionService } = getContainer()
    const result = await staffSessionService.recordVisitorSession({
      ...parsed.data,
      createdByStaffId: auth.staff.id,
    })

    if (!result.ok) {
      return NextResponse.json(apiFailureFromMembershipDomainError(result.error), {
        status: statusForMembershipDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ session: toApiSession(result.value) }), { status: 201 })
  })
}

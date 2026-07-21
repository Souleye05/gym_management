import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../../shared/api-response'
import { getContainer } from '../../../shared/container'
import { withInternalErrorHandling } from '../../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../../auth/http/require-staff-auth'
import { apiFailureFromMembershipDomainError, statusForMembershipDomainError } from '../membership-api-response'
import { toApiSubscription } from './to-api-subscription'

export async function suspendSubscriptionController(req: NextRequest, id: string): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { staffSubscriptionService } = getContainer()
    const result = await staffSubscriptionService.suspendSubscription(id)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromMembershipDomainError(result.error), {
        status: statusForMembershipDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ subscription: toApiSubscription(result.value) }))
  })
}

import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromZod, apiSuccess } from '../../../shared/api-response'
import { getContainer } from '../../../shared/container'
import { withInternalErrorHandling } from '../../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../../auth/http/require-staff-auth'
import { CreateOrRenewSubscriptionSchema } from '../../dto/subscription.dto'
import { apiFailureFromMembershipDomainError, statusForMembershipDomainError } from '../membership-api-response'
import { toApiSubscription } from './to-api-subscription'

export async function createOrRenewSubscriptionController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = CreateOrRenewSubscriptionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { staffSubscriptionService } = getContainer()
    const result = await staffSubscriptionService.createOrRenewSubscription({
      ...parsed.data,
      createdByStaffId: auth.staff.id,
    })

    if (!result.ok) {
      return NextResponse.json(apiFailureFromMembershipDomainError(result.error), {
        status: statusForMembershipDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ subscription: toApiSubscription(result.value) }), { status: 201 })
  })
}

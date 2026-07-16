import { NextResponse, type NextRequest } from 'next/server'
import { apiFailure, apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'
import { hasPermission } from '../../shared/authorization/permissions'

export async function deactivateClientController(req: NextRequest, id: string): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  if (!hasPermission(auth.staff.role, 'client:deactivate')) {
    return NextResponse.json(apiFailure('forbidden'), { status: 403 })
  }

  return withInternalErrorHandling(async () => {
    const { clientService } = getContainer()
    const result = await clientService.deactivateClient(id)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess(null, 'Client désactivé'))
  })
}

import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'

export async function getClientController(req: NextRequest, id: string): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { searchParams } = new URL(req.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const { clientService } = getContainer()
    const result = await clientService.getClient(id, { activeOnly: !includeInactive })

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ client: result.value }))
  })
}

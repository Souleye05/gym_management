import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'

export async function getClientController(req: NextRequest, id: string): Promise<NextResponse> {
  return withInternalErrorHandling(async () => {
    const { clientService } = getContainer()
    const result = await clientService.getClient(id)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ client: result.value }))
  })
}

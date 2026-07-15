import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromZod, apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { CreateClientSchema } from '../dto/client.dto'

export async function createClientController(req: NextRequest): Promise<NextResponse> {
  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = CreateClientSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { clientService } = getContainer()
    const result = await clientService.createClient(parsed.data)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ client: result.value }, 'Client créé'), { status: 201 })
  })
}

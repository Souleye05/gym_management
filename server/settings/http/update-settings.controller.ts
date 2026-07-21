import { NextResponse, type NextRequest } from 'next/server'
import { apiFailure, apiFailureFromZod, apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'
import { hasPermission } from '../../shared/authorization/permissions'
import { UpdateSettingsSchema } from '../dto/settings.dto'

export async function updateSettingsController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  if (!hasPermission(auth.staff.role, 'settings:update')) {
    return NextResponse.json(apiFailure('forbidden'), { status: 403 })
  }

  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = UpdateSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { settingsService } = getContainer()
    const settings = await settingsService.updateSettings(parsed.data)
    return NextResponse.json(apiSuccess({ settings }))
  })
}

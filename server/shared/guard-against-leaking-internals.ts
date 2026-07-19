/**
 * Runs `operation` and, if it throws, logs the real error server-side (tagged with `source` for
 * triage) and rethrows a generic error whose message is safe to eventually surface in an HTTP
 * response. No Prisma message, code, or constraint name is ever allowed past this boundary.
 */
export async function guardAgainstLeakingInternals<T>(source: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    console.error(`[${source}] unexpected repository failure`, cause)
    throw new Error('internal-error')
  }
}

/**
 * Throws if `value` is not one of `allowed`. Used in place of an unchecked `as` cast when mapping
 * a raw database enum column to its domain union type — fails loudly (caught by
 * guardAgainstLeakingInternals, surfaced as a generic internal error) instead of silently letting
 * an unexpected value flow through and later vanish at the API boundary (e.g. a lookup table keyed
 * by the domain union returning `undefined`, which JSON.stringify then drops from the response).
 */
export function validateEnum<T extends string>(value: string, allowed: readonly T[], fieldName: string): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`Unexpected ${fieldName} value from database: "${value}"`)
  }
  return value as T
}

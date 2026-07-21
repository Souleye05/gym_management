// server/memberships/infrastructure/test-helpers/create-test-staff.ts
import { prismaClient } from '../../../shared/prisma-client'

/** Creates a real StaffAccount row for a test fixture and returns its id. */
export async function createTestStaff(email: string): Promise<string> {
  const staff = await prismaClient.staffAccount.create({
    data: { email, passwordHash: 'unused-in-this-test', name: 'Test Staff', role: 'ADMIN' },
  })
  return staff.id
}

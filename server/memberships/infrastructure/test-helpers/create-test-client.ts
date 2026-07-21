import { prismaClient } from '../../../shared/prisma-client'
import { PrismaClientRepository } from '../../../clients/infrastructure/prisma-client.repository'

const clientRepository = new PrismaClientRepository(prismaClient)

/** Creates a real Client row for a test fixture and returns its id. */
export async function createTestClient(phone: string): Promise<string> {
  const client = await clientRepository.create({ name: 'Test Client', phone })
  return client.id
}

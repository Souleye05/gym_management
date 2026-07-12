import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../lib/generated/prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

export const prismaClient = globalThis.__prismaClient ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prismaClient = prismaClient
}

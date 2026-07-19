// prisma/seed.ts
import { Role } from '../lib/generated/prisma/client'
import argon2 from 'argon2'
import { prismaClient as prisma } from '../server/shared/prisma-client'

const STAFF_SEED = [
  { email: 'admin@atlas.fit', password: 'admin123', name: 'Admin Studio', role: Role.ADMIN },
  { email: 'agent@atlas.fit', password: 'agent123', name: 'Agent Caisse', role: Role.AGENT },
]

const CLIENT_ACCOUNT_SEED = [
  { phone: '+33612345601', name: 'Yasmine Kaddour', linkToClient: true },
  { phone: '+33612345602', name: 'Marc Delaunay', linkToClient: true },
  { phone: '+33612345603', name: 'Inès Fabre', linkToClient: true },
  { phone: '+33612345604', name: 'Karim Benali', linkToClient: false },
]

const DAY_MS = 24 * 60 * 60 * 1000

async function main() {
  for (const staff of STAFF_SEED) {
    const passwordHash = await argon2.hash(staff.password)
    await prisma.staffAccount.upsert({
      where: { email: staff.email },
      update: { passwordHash, name: staff.name, role: staff.role },
      create: { email: staff.email, passwordHash, name: staff.name, role: staff.role },
    })
  }

  const adminSeed = STAFF_SEED.find((staff) => staff.role === Role.ADMIN)
  if (!adminSeed) throw new Error('STAFF_SEED has no ADMIN entry')
  const admin = await prisma.staffAccount.findUniqueOrThrow({ where: { email: adminSeed.email } })

  const linkedClients: Record<string, string> = {}

  for (const seed of CLIENT_ACCOUNT_SEED) {
    const account = await prisma.clientAccount.upsert({
      where: { phone: seed.phone },
      update: { name: seed.name },
      create: { phone: seed.phone, name: seed.name },
    })

    if (seed.linkToClient) {
      let client = await prisma.client.findUnique({ where: { clientAccountId: account.id } })
      if (!client) {
        client = await prisma.client.create({
          data: { name: seed.name, phone: seed.phone, clientAccountId: account.id },
        })
      }
      linkedClients[seed.phone] = client.id
    }
  }

  // Yasmine Kaddour: active current subscription + one past subscription + recent sessions.
  // Wrapped in a transaction so an interrupted seed run can never leave this client with only
  // some of its rows created — the hasSubscriptions guard below only stays accurate ("0 rows" or
  // "fully seeded", never partial) if the whole block commits atomically or not at all.
  const yasmineId = linkedClients['+33612345601']
  if (yasmineId) {
    const hasSubscriptions = await prisma.subscription.findFirst({ where: { clientId: yasmineId } })
    if (!hasSubscriptions) {
      await prisma.$transaction(async (tx) => {
        await tx.subscription.create({
          data: {
            clientId: yasmineId,
            planId: 'MONTHLY',
            startDate: new Date(Date.now() - 120 * DAY_MS),
            endDate: new Date(Date.now() - 90 * DAY_MS),
            amountPaid: 40,
            paymentMethod: 'CASH',
            createdByStaffId: admin.id,
          },
        })
        await tx.subscription.create({
          data: {
            clientId: yasmineId,
            planId: 'QUARTERLY',
            startDate: new Date(Date.now() - 30 * DAY_MS),
            endDate: new Date(Date.now() + 60 * DAY_MS),
            amountPaid: 105,
            paymentMethod: 'CARD',
            createdByStaffId: admin.id,
          },
        })
        await tx.session.create({
          data: {
            type: 'SUBSCRIBER',
            clientId: yasmineId,
            amountPaid: 8,
            paymentMethod: 'CASH',
            checkedInAt: new Date(Date.now() - 2 * DAY_MS),
            createdByStaffId: admin.id,
          },
        })
        await tx.session.create({
          data: {
            type: 'SUBSCRIBER',
            clientId: yasmineId,
            amountPaid: 8,
            paymentMethod: 'CARD',
            checkedInAt: new Date(Date.now() - 1 * DAY_MS),
            createdByStaffId: admin.id,
          },
        })
      })
    }
  }

  // Marc Delaunay: expired subscription only (currentSubscription should resolve to null).
  const marcId = linkedClients['+33612345602']
  if (marcId) {
    const hasSubscriptions = await prisma.subscription.findFirst({ where: { clientId: marcId } })
    if (!hasSubscriptions) {
      await prisma.$transaction(async (tx) => {
        await tx.subscription.create({
          data: {
            clientId: marcId,
            planId: 'MONTHLY',
            startDate: new Date(Date.now() - 60 * DAY_MS),
            endDate: new Date(Date.now() - 30 * DAY_MS),
            amountPaid: 40,
            paymentMethod: 'MOBILE_MONEY',
            createdByStaffId: admin.id,
          },
        })
        await tx.session.create({
          data: {
            type: 'SUBSCRIBER',
            clientId: marcId,
            amountPaid: 8,
            paymentMethod: 'CASH',
            checkedInAt: new Date(Date.now() - 35 * DAY_MS),
            createdByStaffId: admin.id,
          },
        })
      })
    }
  }

  // Inès Fabre: current subscription but suspended (tests the suspended badge in the portal).
  const inesId = linkedClients['+33612345603']
  if (inesId) {
    const hasSubscriptions = await prisma.subscription.findFirst({ where: { clientId: inesId } })
    if (!hasSubscriptions) {
      await prisma.subscription.create({
        data: {
          clientId: inesId,
          planId: 'ANNUAL',
          startDate: new Date(Date.now() - 30 * DAY_MS),
          endDate: new Date(Date.now() + 335 * DAY_MS),
          suspended: true,
          amountPaid: 350,
          paymentMethod: 'CARD',
          createdByStaffId: admin.id,
        },
      })
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })

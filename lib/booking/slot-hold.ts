import { Prisma } from '@/lib/prisma-client/client'
type TxClient = Prisma.TransactionClient
export class SlotAlreadyBookedError extends Error {
  constructor() {
    super('Selected slot is already booked.')
    this.name = 'SlotAlreadyBookedError'
  }
}

export class SlotHeldByAnotherSessionError extends Error {
  constructor() {
    super('Selected slot is currently held by another session.')
    this.name = 'SlotHeldByAnotherSessionError'
  }
}

export class SlotNotFoundError extends Error {
  constructor() {
    super('Selected slot was not found.')
    this.name = 'SlotNotFoundError'
  }
}

async function lockSlotRow(tx: TxClient, slotId: string) {
  await tx.$queryRaw`
    SELECT id
    FROM "available_slots"
    WHERE id = ${slotId}
    FOR UPDATE
  `
}

export async function holdAvailableSlot(
  tx: TxClient,
  params: {
    slotId: string
    sessionId: string
    now?: Date
  },
) {
  const now = params.now ?? new Date()

  await lockSlotRow(tx, params.slotId)

  const slot = await tx.availableSlot.findUnique({
    where: { id: params.slotId },
    select: {
      id: true,
      isBooked: true,
      isHeld: true,
      heldBySessionId: true,
      heldAt: true,
    },
  })

  if (!slot) {
    throw new SlotNotFoundError()
  }

  if (slot.isBooked) {
    throw new SlotAlreadyBookedError()
  }

  if (slot.isHeld && slot.heldBySessionId !== params.sessionId) {
    throw new SlotHeldByAnotherSessionError()
  }

  return tx.availableSlot.update({
    where: { id: params.slotId },
    data: {
      isHeld: true,
      heldBySessionId: params.sessionId,
      heldAt: now,
    },
  })
}

export async function releaseHeldSlotsForSession(
  tx: TxClient,
  sessionId: string,
) {
  return tx.availableSlot.updateMany({
    where: {
      heldBySessionId: sessionId,
      isHeld: true,
      isBooked: false,
    },
    data: {
      isHeld: false,
      heldBySessionId: null,
      heldAt: null,
    },
  })
}

export async function finalizeBookedSlot(
  tx: TxClient,
  params: {
    slotId: string
    sessionId: string
  },
) {
  await lockSlotRow(tx, params.slotId)

  const slot = await tx.availableSlot.findUnique({
    where: { id: params.slotId },
    select: {
      id: true,
      isBooked: true,
      isHeld: true,
      heldBySessionId: true,
    },
  })

  if (!slot) {
    throw new SlotNotFoundError()
  }

  if (slot.isBooked) {
    throw new SlotAlreadyBookedError()
  }

  if (slot.isHeld && slot.heldBySessionId !== params.sessionId) {
    throw new SlotHeldByAnotherSessionError()
  }

  return tx.availableSlot.update({
    where: { id: params.slotId },
    data: {
      isBooked: true,
      isHeld: false,
      heldBySessionId: null,
      heldAt: null,
    },
  })
}
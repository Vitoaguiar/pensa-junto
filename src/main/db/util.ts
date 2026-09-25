import { randomUUID } from 'node:crypto'

export const uuid = (): string => randomUUID()
/** ISO-8601 em UTC. */
export const nowIso = (): string => new Date().toISOString()

import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../connection'
import { messages, type MessageRow } from '../schema'
import { nowIso, uuid } from '../util'

export type NewMessage = Pick<MessageRow, 'sessionId' | 'questionId' | 'role' | 'kind' | 'content' | 'source'> &
  Partial<Pick<MessageRow, 'hintLevel' | 'modelId'>>

export function createMessagesRepo(db: Db) {
  let lastStamp = ''
  return {
    insert(input: NewMessage): MessageRow {
      // Garante ordem estável mesmo com duas mensagens no mesmo milissegundo.
      let now = nowIso()
      if (now <= lastStamp) now = new Date(Date.parse(lastStamp) + 1).toISOString()
      lastStamp = now
      const row: MessageRow = {
        id: uuid(),
        hintLevel: null,
        modelId: null,
        ...input,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncedAt: null
      }
      db.insert(messages).values(row).run()
      return row
    },
    listBySession(sessionId: string): MessageRow[] {
      return db
        .select()
        .from(messages)
        .where(and(eq(messages.sessionId, sessionId), isNull(messages.deletedAt)))
        .orderBy(asc(messages.createdAt))
        .all()
    }
  }
}
export type MessagesRepo = ReturnType<typeof createMessagesRepo>

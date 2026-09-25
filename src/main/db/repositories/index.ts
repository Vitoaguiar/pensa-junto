import type { Db } from '../connection'
import { createClassroomsRepo } from './classrooms'
import { createMessagesRepo } from './messages'
import { createBnccRepo, createLogsRepo } from './misc'
import { createModelsRepo } from './models'
import { createQuestionsRepo } from './questions'
import { createSessionsRepo } from './sessions'
import { createSettingsRepo } from './settings'
import { createStudentsRepo } from './students'

export function createRepositories(db: Db) {
  return {
    settings: createSettingsRepo(db),
    classrooms: createClassroomsRepo(db),
    students: createStudentsRepo(db),
    sessions: createSessionsRepo(db),
    questions: createQuestionsRepo(db),
    messages: createMessagesRepo(db),
    models: createModelsRepo(db),
    bncc: createBnccRepo(db),
    logs: createLogsRepo(db)
  }
}
export type Repositories = ReturnType<typeof createRepositories>

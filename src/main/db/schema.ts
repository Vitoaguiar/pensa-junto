import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Esquema SQLite (seção 6.2). Convenções: IDs UUID v4 em TEXT, datas ISO-8601 UTC em TEXT,
// JSON em TEXT, soft delete em deleted_at e synced_at para a sincronização opcional.

const syncColumns = {
  deletedAt: text('deleted_at'),
  syncedAt: text('synced_at')
}

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const llmModels = sqliteTable(
  'llm_models',
  {
    id: text('id').primaryKey(),
    catalogKey: text('catalog_key'),
    displayName: text('display_name').notNull(),
    filePath: text('file_path').notNull(),
    fileSizeBytes: integer('file_size_bytes'),
    quantization: text('quantization'),
    source: text('source', { enum: ['catalog', 'imported'] }).notNull(),
    status: text('status', { enum: ['downloading', 'ready', 'error'] }).notNull(),
    sha256: text('sha256'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    check('llm_models_source_check', sql`${t.source} IN ('catalog','imported')`),
    check('llm_models_status_check', sql`${t.status} IN ('downloading','ready','error')`)
  ]
)

export const classrooms = sqliteTable(
  'classrooms',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    grade: integer('grade').notNull(),
    schoolYear: integer('school_year').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    ...syncColumns
  },
  (t) => [check('classrooms_grade_check', sql`${t.grade} BETWEEN 1 AND 5`)]
)

export const students = sqliteTable(
  'students',
  {
    id: text('id').primaryKey(),
    classroomId: text('classroom_id').references(() => classrooms.id),
    fullName: text('full_name').notNull(),
    displayName: text('display_name').notNull(),
    grade: integer('grade').notNull(),
    pinHash: text('pin_hash').notNull(),
    avatarKey: text('avatar_key').notNull(),
    colorKey: text('color_key').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    ...syncColumns
  },
  (t) => [
    check('students_grade_check', sql`${t.grade} BETWEEN 1 AND 5`),
    uniqueIndex('ux_students_pin_active')
      .on(t.pinHash)
      .where(sql`deleted_at IS NULL AND is_active = 1`)
  ]
)

export const bnccSkills = sqliteTable('bncc_skills', {
  code: text('code').primaryKey(),
  grade: integer('grade').notNull(),
  thematicUnit: text('thematic_unit').notNull(),
  objectOfKnowledge: text('object_of_knowledge'),
  description: text('description').notNull(),
  isEnabled: integer('is_enabled').notNull().default(1)
})

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    title: text('title').notNull(),
    focus: text('focus', { enum: ['add_sub', 'mul', 'div', 'mixed'] }).notNull(),
    status: text('status', { enum: ['active', 'finished', 'archived'] }).notNull(),
    questionsTarget: integer('questions_target').notNull().default(5),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastActivityAt: text('last_activity_at').notNull(),
    ...syncColumns
  },
  (t) => [
    check('sessions_focus_check', sql`${t.focus} IN ('add_sub','mul','div','mixed')`),
    check('sessions_status_check', sql`${t.status} IN ('active','finished','archived')`),
    index('ix_sessions_student_activity').on(t.studentId, sql`last_activity_at DESC`)
  ]
)

export const questions = sqliteTable(
  'questions',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    position: integer('position').notNull(),
    skillCode: text('skill_code')
      .notNull()
      .references(() => bnccSkills.code),
    templateId: text('template_id').notNull(),
    seed: integer('seed').notNull(),
    paramsJson: text('params_json').notNull(),
    correctAnswerJson: text('correct_answer_json').notNull(),
    statement: text('statement').notNull(),
    statementSource: text('statement_source', { enum: ['llm', 'fallback'] }).notNull(),
    theme: text('theme').notNull(),
    status: text('status', { enum: ['pending', 'correct', 'skipped', 'needs_teacher'] }).notNull(),
    hintsUsed: integer('hints_used').notNull().default(0),
    attemptsCount: integer('attempts_count').notNull().default(0),
    createdAt: text('created_at').notNull(),
    answeredAt: text('answered_at'),
    updatedAt: text('updated_at').notNull(),
    ...syncColumns
  },
  (t) => [
    check('questions_statement_source_check', sql`${t.statementSource} IN ('llm','fallback')`),
    check('questions_status_check', sql`${t.status} IN ('pending','correct','skipped','needs_teacher')`),
    index('ix_questions_session').on(t.sessionId, t.position)
  ]
)

export const attempts = sqliteTable('attempts', {
  id: text('id').primaryKey(),
  questionId: text('question_id')
    .notNull()
    .references(() => questions.id),
  answerJson: text('answer_json').notNull(),
  isCorrect: integer('is_correct').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  ...syncColumns
})

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    questionId: text('question_id').references(() => questions.id),
    role: text('role', { enum: ['student', 'tutor', 'event'] }).notNull(),
    kind: text('kind', { enum: ['chat', 'hint', 'rephrase', 'example', 'feedback', 'event'] }).notNull(),
    hintLevel: integer('hint_level'),
    content: text('content').notNull(),
    source: text('source', { enum: ['llm', 'fallback', 'system'] }).notNull(),
    modelId: text('model_id').references(() => llmModels.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    ...syncColumns
  },
  (t) => [
    check('messages_role_check', sql`${t.role} IN ('student','tutor','event')`),
    check('messages_kind_check', sql`${t.kind} IN ('chat','hint','rephrase','example','feedback','event')`),
    check('messages_hint_level_check', sql`${t.hintLevel} BETWEEN 1 AND 3`),
    check('messages_source_check', sql`${t.source} IN ('llm','fallback','system')`),
    index('ix_messages_session').on(t.sessionId, t.createdAt)
  ]
)

export const generationLogs = sqliteTable('generation_logs', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  modelId: text('model_id').references(() => llmModels.id),
  latencyMs: integer('latency_ms').notNull(),
  retries: integer('retries').notNull(),
  fellBack: integer('fell_back').notNull(),
  createdAt: text('created_at').notNull()
})

export type StudentRow = typeof students.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type QuestionRow = typeof questions.$inferSelect
export type MessageRow = typeof messages.$inferSelect
export type ClassroomRow = typeof classrooms.$inferSelect
export type LlmModelRow = typeof llmModels.$inferSelect
export type AttemptRow = typeof attempts.$inferSelect

/** Tabelas que vão para a nuvem (settings, llm_models e generation_logs ficam só no computador). */
export const SYNCABLE_TABLES = ['classrooms', 'students', 'sessions', 'questions', 'attempts', 'messages'] as const

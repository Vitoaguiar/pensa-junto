import { z } from 'zod'
import { AVATAR_KEYS, COLOR_KEYS } from '@shared/types'
import type { IpcChannel } from '@shared/channels'

// Todo payload vindo do renderer é validado aqui antes de chegar aos serviços.

const none = z.undefined()
const id = z.string().uuid()
const requestId = z.string().min(1).max(64)
const name = z.string().trim().min(1).max(80)
const grade = z.number().int().min(1).max(5)
const digits = z.string().max(12)

const studentInput = z.object({
  fullName: name,
  displayName: z.string().trim().min(1).max(24),
  grade,
  avatarKey: z.enum(AVATAR_KEYS),
  colorKey: z.enum(COLOR_KEYS as [string, ...string[]]),
  classroomId: id.nullable()
})

const answer = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('integer'), value: digits }),
  z.object({ kind: z.literal('division'), quotient: digits, remainder: digits })
])

export const ipcSchemas = {
  'app:status': none,
  'app:finishOnboarding': none,
  'app:toggleFullscreen': none,
  'app:stats': none,

  'models:list': none,
  'models:download': z.object({ key: z.string().max(40) }),
  'models:cancelDownload': z.object({ key: z.string().max(40) }),
  'models:import': none,
  'models:adopt': z.object({ key: z.string().max(40) }),
  'models:remove': z.object({ modelId: id }),
  'models:test': z.object({ modelId: id }),
  'models:activate': z.object({ modelId: id }),
  'models:useBasicMode': none,

  'auth:verifyPin': z.object({ pin: z.string().regex(/^\d{4}$/) }),
  'auth:currentStudent': none,
  'auth:logoutStudent': none,
  'auth:setTeacherPassword': z.object({ password: z.string().min(4).max(128) }),
  'auth:verifyTeacherPassword': z.object({ password: z.string().max(128) }),
  'auth:lockTeacher': none,

  'students:list': none,
  'students:create': studentInput,
  'students:update': z.object({
    id,
    patch: studentInput.partial().extend({ isActive: z.boolean().optional() })
  }),
  'students:resetPin': z.object({ id }),
  'students:pinCards': z.object({ classroomId: id.nullable().optional() }),

  'classrooms:list': none,
  'classrooms:create': z.object({ name, grade, schoolYear: z.number().int().min(2000).max(2100) }),
  'classrooms:update': z.object({
    id,
    name: name.optional(),
    grade: grade.optional(),
    schoolYear: z.number().int().min(2000).max(2100).optional()
  }),
  'classrooms:delete': z.object({ id }),

  'sessions:listByStudent': none,
  'sessions:create': z.object({ focus: z.enum(['add_sub', 'mul', 'div', 'mixed']) }),
  'sessions:get': z.object({ sessionId: id }),

  'questions:next': z.object({ sessionId: id, requestId }),
  'questions:submitAnswer': z.object({ questionId: id, answer, requestId }),
  'questions:callTeacher': z.object({ questionId: id }),
  'questions:skip': z.object({ questionId: id }),

  'tutor:hint': z.object({ questionId: id, requestId }),
  'tutor:rephrase': z.object({ questionId: id, requestId }),
  'tutor:example': z.object({ questionId: id, requestId }),
  'tutor:chat': z.object({ questionId: id, text: z.string().trim().min(1).max(200), requestId })
} satisfies Record<IpcChannel, z.ZodTypeAny>

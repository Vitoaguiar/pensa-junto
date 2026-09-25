import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { z } from 'zod'
import type { IpcChannel, IpcContract, IpcEvent, IpcEvents, IpcResult } from '@shared/channels'
import type { AppStatusDto } from '@shared/types'
import type { Repositories } from '../db/repositories'
import type { EvaluationService } from '../evaluation/evaluationService'
import type { LlmService } from '../llm/llmService'
import { FriendlyError, type ModelManager } from '../llm/modelManager'
import { AuthError, type AuthService } from '../services/auth'
import { LearningError, type LearningService } from '../services/learning'
import type { StudentsService } from '../services/students'
import { ipcSchemas } from './schemas'

export interface IpcDeps {
  repos: Repositories
  auth: AuthService
  students: StudentsService
  learning: LearningService
  models: ModelManager
  evaluation: EvaluationService
  llm: LlmService
  isDev: boolean
  syncEnabled: boolean
  getWindow: () => BrowserWindow | null
}

type Handler<C extends IpcChannel> = (
  payload: IpcContract[C]['req']
) => IpcContract[C]['res'] | Promise<IpcContract[C]['res']>

/** Erros "de negócio" viram mensagens amigáveis; o resto é logado e vira uma mensagem genérica. */
function friendlyMessage(err: unknown): string {
  if (err instanceof AuthError || err instanceof LearningError || err instanceof FriendlyError) return err.message
  console.error('[ipc]', err)
  return 'Algo deu errado. Tente de novo.'
}

export function sendEvent<E extends IpcEvent>(win: BrowserWindow | null, event: E, payload: IpcEvents[E]): void {
  if (win && !win.isDestroyed()) win.webContents.send(event, payload)
}

export function registerIpc(deps: IpcDeps): { status: () => AppStatusDto } {
  const { auth, students, learning, models, llm, repos, evaluation } = deps

  function handle<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
    ipcMain.handle(channel, async (event, raw): Promise<IpcResult<IpcContract[C]['res']>> => {
      // Só a janela do app pode chamar (nada de frames ou páginas externas).
      const win = deps.getWindow()
      if (!win || event.sender !== win.webContents) return { ok: false, error: 'Origem não permitida.' }
      const parsed = (ipcSchemas[channel] as z.ZodTypeAny).safeParse(raw)
      if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
      try {
        return { ok: true, data: await handler(parsed.data as IpcContract[C]['req']) }
      } catch (err) {
        return { ok: false, error: friendlyMessage(err) }
      }
    })
  }

  const status = (): AppStatusDto => {
    const engine = llm.state()
    const activeId = llm.activeModelId
    return {
      onboardingDone: auth.onboardingDone(),
      hasTeacherPassword: auth.hasTeacherPassword(),
      teacherUnlocked: auth.isTeacherUnlocked(),
      basicMode: !activeId || engine.state === 'error' || engine.state === 'none',
      engine,
      activeModelName: activeId ? (repos.models.get(activeId)?.displayName ?? null) : null,
      isDev: deps.isDev,
      syncEnabled: deps.syncEnabled
    }
  }

  const teacher = <T>(fn: () => T): T => {
    auth.requireTeacher()
    return fn()
  }

  // ---------- App ----------
  handle('app:status', () => status())
  handle('app:finishOnboarding', () =>
    teacher(() => {
      repos.settings.set('onboarding_done', '1')
      auth.lockTeacher()
      return status()
    })
  )
  handle('app:toggleFullscreen', () => {
    const win = deps.getWindow()
    if (!win) return false
    win.setFullScreen(!win.isFullScreen())
    return win.isFullScreen()
  })
  handle('app:stats', () => teacher(() => repos.logs.stats()))

  // ---------- Modelos ----------
  handle('models:list', () => teacher(() => models.overview()))
  handle('models:download', async ({ key }) => {
    auth.requireTeacher()
    await models.download(key)
    return models.overview()
  })
  handle('models:cancelDownload', async ({ key }) => {
    auth.requireTeacher()
    await models.cancelDownload(key)
    return models.overview()
  })
  handle('models:import', async () => {
    auth.requireTeacher()
    const win = deps.getWindow()
    const options = {
      title: 'Importar modelo (.gguf)',
      filters: [{ name: 'Modelo GGUF', extensions: ['gguf'] }],
      properties: ['openFile' as const]
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const file = picked.filePaths[0]
    if (picked.canceled || !file) return null
    const row = await models.importFile(file)
    return {
      modelId: row.id,
      catalogKey: row.catalogKey,
      displayName: row.displayName,
      friendlyName: null,
      sizeBytes: row.fileSizeBytes,
      filePath: row.filePath,
      location: 'app' as const,
      active: row.id === llm.activeModelId
    }
  })
  handle('models:adopt', async ({ key }) => {
    auth.requireTeacher()
    await models.adopt(key)
    return models.overview()
  })
  handle('models:remove', async ({ modelId }) => {
    auth.requireTeacher()
    const { keptFile } = await models.remove(modelId)
    sendEvent(deps.getWindow(), 'app:onStatus', status())
    return { overview: await models.overview(), keptFile }
  })
  handle('models:test', ({ modelId }) => teacher(() => models.test(modelId)))
  handle('models:activate', async ({ modelId }) => {
    auth.requireTeacher()
    const ok = await models.activate(modelId)
    if (!ok) throw new FriendlyError('Não foi possível abrir este modelo neste computador.')
    sendEvent(deps.getWindow(), 'app:onStatus', status())
    return models.overview()
  })
  handle('models:useBasicMode', async () => {
    auth.requireTeacher()
    await llm.deactivate()
    sendEvent(deps.getWindow(), 'app:onStatus', status())
    return models.overview()
  })

  // ---------- Modo de avaliação (professor) ----------
  handle('evaluation:list', () => teacher(() => evaluation.list()))
  handle('evaluation:create', async (options) => {
    auth.requireTeacher()
    try {
      return await evaluation.create(options)
    } catch (err) {
      throw new FriendlyError(err instanceof Error ? err.message : 'Não foi possível gerar a rodada.')
    }
  })
  handle('evaluation:cancel', () =>
    teacher(() => {
      evaluation.cancel()
      return true as const
    })
  )
  handle('evaluation:importRatings', async ({ code }) => {
    auth.requireTeacher()
    const win = deps.getWindow()
    const options = {
      title: 'Importar planilhas preenchidas pelos avaliadores',
      filters: [{ name: 'Planilha CSV', extensions: ['csv'] }],
      properties: ['openFile' as const, 'multiSelections' as const]
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) return null
    return evaluation.importRatings(code, picked.filePaths)
  })
  handle('evaluation:report', ({ code }) => teacher(() => evaluation.report(code)))
  handle('evaluation:openFolder', async ({ code }) => {
    auth.requireTeacher()
    await shell.openPath(evaluation.folderOf(code))
    return true as const
  })
  handle('evaluation:openReport', async ({ code }) => {
    auth.requireTeacher()
    const { reportPath } = evaluation.report(code)
    await shell.openPath(reportPath)
    return true as const
  })

  // ---------- Autenticação ----------
  handle('auth:verifyPin', ({ pin }) => auth.verifyPin(pin))
  handle('auth:currentStudent', () => auth.currentStudent())
  handle('auth:logoutStudent', () => {
    auth.logoutStudent()
    return true
  })
  handle('auth:setTeacherPassword', ({ password }) => {
    auth.setTeacherPassword(password)
    return true
  })
  handle('auth:verifyTeacherPassword', ({ password }) => auth.verifyTeacherPassword(password))
  handle('auth:lockTeacher', () => {
    auth.lockTeacher()
    return true
  })

  // ---------- Alunos e turmas (professor) ----------
  handle('students:list', () => teacher(() => students.list()))
  handle('students:create', (input) => teacher(() => students.create(input)))
  handle('students:update', ({ id, patch }) => teacher(() => students.update(id, patch)))
  handle('students:resetPin', ({ id }) => teacher(() => students.resetPin(id)))
  handle('students:pinCards', ({ classroomId }) => teacher(() => students.pinCards(classroomId)))
  handle('classrooms:list', () => teacher(() => students.listClassrooms()))
  handle('classrooms:create', (input) => teacher(() => students.createClassroom(input)))
  handle('classrooms:update', ({ id, ...patch }) =>
    teacher(() => {
      students.updateClassroom(id, patch)
      return true as const
    })
  )
  handle('classrooms:delete', ({ id }) =>
    teacher(() => {
      students.deleteClassroom(id)
      return true as const
    })
  )

  // ---------- Sessões, questões e tutor (aluno logado) ----------
  handle('sessions:listByStudent', () => learning.listSessions(auth.requireStudent()))
  handle('sessions:create', ({ focus }) => learning.createSession(auth.requireStudent(), focus))
  handle('sessions:get', ({ sessionId }) => learning.getState(auth.requireStudent(), sessionId))
  handle('questions:next', ({ sessionId, requestId }) =>
    learning.nextQuestion(auth.requireStudent(), sessionId, requestId)
  )
  handle('questions:submitAnswer', ({ questionId, answer, requestId }) =>
    learning.submitAnswer(auth.requireStudent(), questionId, answer, requestId)
  )
  handle('questions:callTeacher', ({ questionId }) => learning.callTeacher(auth.requireStudent(), questionId))
  handle('questions:skip', ({ questionId }) => learning.skip(auth.requireStudent(), questionId))
  handle('tutor:hint', ({ questionId, requestId }) => learning.hint(auth.requireStudent(), questionId, requestId))
  handle('tutor:rephrase', ({ questionId, requestId }) =>
    learning.rephrase(auth.requireStudent(), questionId, requestId)
  )
  handle('tutor:example', ({ questionId, requestId }) =>
    learning.example(auth.requireStudent(), questionId, requestId)
  )
  handle('tutor:chat', ({ questionId, text, requestId }) =>
    learning.chat(auth.requireStudent(), questionId, text, requestId)
  )
  return { status }
}

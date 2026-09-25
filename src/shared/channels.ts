// Contrato de IPC: canais, payloads e respostas. Sem dependências (é importado pelo preload sandboxed).

import type {
  AnswerInputDto,
  EvaluationCreateOptionsDto,
  EvaluationImportResultDto,
  EvaluationProgressDto,
  EvaluationReportDto,
  EvaluationSetDto,
  AppStatusDto,
  ClassroomDto,
  DownloadProgressDto,
  Focus,
  GenerationStatsDto,
  HelpActionResultDto,
  InstalledModelDto,
  ModelsOverviewDto,
  ModelTestResultDto,
  RemoveModelResultDto,
  SessionStateDto,
  SessionSummaryDto,
  StreamEventDto,
  StudentDto,
  StudentPublicDto,
  StudentWithPinDto,
  SubmitResultDto,
  TutorReplyDto,
  VerifyPinResult
} from './types'

export interface StudentInputDto {
  fullName: string
  displayName: string
  grade: number
  avatarKey: string
  colorKey: string
  classroomId: string | null
}

type Void = undefined

export interface IpcContract {
  'app:status': { req: Void; res: AppStatusDto }
  'app:finishOnboarding': { req: Void; res: AppStatusDto }
  'app:toggleFullscreen': { req: Void; res: boolean }
  'app:stats': { req: Void; res: GenerationStatsDto[] }

  'models:list': { req: Void; res: ModelsOverviewDto }
  'models:download': { req: { key: string }; res: ModelsOverviewDto }
  'models:cancelDownload': { req: { key: string }; res: ModelsOverviewDto }
  'models:import': { req: Void; res: InstalledModelDto | null }
  'models:adopt': { req: { key: string }; res: ModelsOverviewDto }
  'models:remove': { req: { modelId: string }; res: RemoveModelResultDto }
  'models:test': { req: { modelId: string }; res: ModelTestResultDto }
  'models:activate': { req: { modelId: string }; res: ModelsOverviewDto }
  'models:useBasicMode': { req: Void; res: ModelsOverviewDto }

  'evaluation:list': { req: Void; res: EvaluationSetDto[] }
  'evaluation:create': { req: EvaluationCreateOptionsDto; res: EvaluationSetDto }
  'evaluation:cancel': { req: Void; res: true }
  'evaluation:importRatings': { req: { code: string }; res: EvaluationImportResultDto | null }
  'evaluation:report': { req: { code: string }; res: EvaluationReportDto }
  'evaluation:openFolder': { req: { code: string }; res: true }
  'evaluation:openReport': { req: { code: string }; res: true }

  'auth:verifyPin': { req: { pin: string }; res: VerifyPinResult }
  'auth:currentStudent': { req: Void; res: StudentPublicDto | null }
  'auth:logoutStudent': { req: Void; res: true }
  'auth:setTeacherPassword': { req: { password: string }; res: true }
  'auth:verifyTeacherPassword': { req: { password: string }; res: boolean }
  'auth:lockTeacher': { req: Void; res: true }

  'students:list': { req: Void; res: StudentDto[] }
  'students:create': { req: StudentInputDto; res: StudentWithPinDto }
  'students:update': {
    req: { id: string; patch: Partial<StudentInputDto> & { isActive?: boolean } }
    res: StudentDto | StudentWithPinDto
  }
  'students:resetPin': { req: { id: string }; res: StudentWithPinDto }
  'students:pinCards': { req: { classroomId?: string | null }; res: StudentWithPinDto[] }

  'classrooms:list': { req: Void; res: ClassroomDto[] }
  'classrooms:create': { req: { name: string; grade: number; schoolYear: number }; res: ClassroomDto }
  'classrooms:update': { req: { id: string; name?: string; grade?: number; schoolYear?: number }; res: true }
  'classrooms:delete': { req: { id: string }; res: true }

  'sessions:listByStudent': { req: Void; res: { active: SessionSummaryDto[]; finished: SessionSummaryDto[] } }
  'sessions:create': { req: { focus: Focus }; res: SessionSummaryDto }
  'sessions:get': { req: { sessionId: string }; res: SessionStateDto }

  'questions:next': { req: { sessionId: string; requestId: string }; res: SessionStateDto }
  'questions:submitAnswer': { req: { questionId: string; answer: AnswerInputDto; requestId: string }; res: SubmitResultDto }
  'questions:callTeacher': { req: { questionId: string }; res: HelpActionResultDto }
  'questions:skip': { req: { questionId: string }; res: HelpActionResultDto }

  'tutor:hint': { req: { questionId: string; requestId: string }; res: TutorReplyDto }
  'tutor:rephrase': { req: { questionId: string; requestId: string }; res: TutorReplyDto }
  'tutor:example': { req: { questionId: string; requestId: string }; res: TutorReplyDto }
  'tutor:chat': { req: { questionId: string; text: string; requestId: string }; res: TutorReplyDto }
}

export interface IpcEvents {
  'models:onProgress': DownloadProgressDto
  'evaluation:onProgress': EvaluationProgressDto
  'tutor:onToken': StreamEventDto
  'app:onStatus': AppStatusDto
}

export type IpcChannel = keyof IpcContract
export type IpcEvent = keyof IpcEvents

export const IPC_CHANNELS = [
  'app:status',
  'app:finishOnboarding',
  'app:toggleFullscreen',
  'app:stats',
  'models:list',
  'models:download',
  'models:cancelDownload',
  'models:import',
  'models:adopt',
  'models:remove',
  'models:test',
  'models:activate',
  'models:useBasicMode',
  'evaluation:list',
  'evaluation:create',
  'evaluation:cancel',
  'evaluation:importRatings',
  'evaluation:report',
  'evaluation:openFolder',
  'evaluation:openReport',
  'auth:verifyPin',
  'auth:currentStudent',
  'auth:logoutStudent',
  'auth:setTeacherPassword',
  'auth:verifyTeacherPassword',
  'auth:lockTeacher',
  'students:list',
  'students:create',
  'students:update',
  'students:resetPin',
  'students:pinCards',
  'classrooms:list',
  'classrooms:create',
  'classrooms:update',
  'classrooms:delete',
  'sessions:listByStudent',
  'sessions:create',
  'sessions:get',
  'questions:next',
  'questions:submitAnswer',
  'questions:callTeacher',
  'questions:skip',
  'tutor:hint',
  'tutor:rephrase',
  'tutor:example',
  'tutor:chat'
] as const satisfies readonly IpcChannel[]

export const IPC_EVENTS = ['models:onProgress', 'evaluation:onProgress', 'tutor:onToken', 'app:onStatus'] as const satisfies readonly IpcEvent[]

/** Tudo que volta do main vem embrulhado, para a mensagem de erro chegar limpa ao renderer. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface PensaJuntoBridge {
  invoke<C extends IpcChannel>(channel: C, payload: IpcContract[C]['req']): Promise<IpcResult<IpcContract[C]['res']>>
  on<E extends IpcEvent>(event: E, listener: (payload: IpcEvents[E]) => void): () => void
}

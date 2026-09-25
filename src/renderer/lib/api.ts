import type { IpcChannel, IpcContract, IpcEvent, IpcEvents } from '@shared/channels'

export class ApiError extends Error {}

/** Chamada tipada ao processo main. Lança ApiError com a mensagem amigável vinda do main. */
export async function call<C extends IpcChannel>(
  channel: C,
  ...args: IpcContract[C]['req'] extends undefined ? [] : [IpcContract[C]['req']]
): Promise<IpcContract[C]['res']> {
  const result = await window.pensaJunto.invoke(channel, args[0] as IpcContract[C]['req'])
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

export function onEvent<E extends IpcEvent>(event: E, listener: (payload: IpcEvents[E]) => void): () => void {
  return window.pensaJunto.on(event, listener)
}

let counter = 0
export function newRequestId(): string {
  counter += 1
  return `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 8)}`
}

export const errorMessage = (err: unknown): string =>
  err instanceof ApiError ? err.message : 'Algo deu errado. Tente de novo.'

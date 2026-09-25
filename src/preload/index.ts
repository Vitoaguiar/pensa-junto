import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, IPC_EVENTS, type PensaJuntoBridge } from '@shared/channels'

// Ponte mínima e tipada. O renderer (sandboxed, sem Node) só enxerga estes dois métodos,
// e só consegue falar com os canais da lista.

const channels = new Set<string>(IPC_CHANNELS)
const events = new Set<string>(IPC_EVENTS)

const bridge: PensaJuntoBridge = {
  invoke(channel, payload) {
    if (!channels.has(channel)) return Promise.reject(new Error(`Canal não permitido: ${channel}`))
    return ipcRenderer.invoke(channel, payload)
  },
  on(event, listener) {
    if (!events.has(event)) throw new Error(`Evento não permitido: ${event}`)
    const wrapped = (_e: IpcRendererEvent, payload: unknown) => listener(payload as never)
    ipcRenderer.on(event, wrapped)
    return () => {
      ipcRenderer.removeListener(event, wrapped)
    }
  }
}

contextBridge.exposeInMainWorld('pensaJunto', bridge)

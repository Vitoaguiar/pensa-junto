import type { PensaJuntoBridge } from '../shared/channels'

declare global {
  interface Window {
    pensaJunto: PensaJuntoBridge
  }
}

export {}

import { create } from 'zustand'
import type { AppStatusDto, StudentPublicDto } from '@shared/types'
import { call } from '../lib/api'

export type ToastTone = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

interface AppState {
  status: AppStatusDto | null
  student: StudentPublicDto | null
  toasts: Toast[]
  refreshStatus: () => Promise<AppStatusDto>
  setStatus: (status: AppStatusDto) => void
  setStudent: (student: StudentPublicDto | null) => void
  toast: (message: string, tone?: ToastTone) => void
  dismissToast: (id: number) => void
}

let toastId = 0

export const useApp = create<AppState>((set) => ({
  status: null,
  student: null,
  toasts: [],
  async refreshStatus() {
    const status = await call('app:status')
    set({ status })
    return status
  },
  setStatus: (status) => set({ status }),
  setStudent: (student) => set({ student }),
  toast(message, tone = 'info') {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

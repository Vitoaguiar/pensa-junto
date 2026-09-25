/// <reference types="electron-vite/node" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAIN_VITE_SYNC_ENABLED?: string
  readonly MAIN_VITE_SUPABASE_URL?: string
  readonly MAIN_VITE_SUPABASE_ANON_KEY?: string
}

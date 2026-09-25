import { eq } from 'drizzle-orm'
import type { Db } from '../connection'
import { settings } from '../schema'
import { nowIso } from '../util'

export type SettingKey = 'active_model_id' | 'teacher_password_hash' | 'pin_pepper' | 'onboarding_done'

export function createSettingsRepo(db: Db) {
  return {
    get(key: SettingKey): string | null {
      return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
    },
    set(key: SettingKey, value: string): void {
      const updatedAt = nowIso()
      db.insert(settings)
        .values({ key, value, updatedAt })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
        .run()
    },
    delete(key: SettingKey): void {
      db.delete(settings).where(eq(settings.key, key)).run()
    }
  }
}
export type SettingsRepo = ReturnType<typeof createSettingsRepo>

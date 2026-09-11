import { sql } from 'drizzle-orm'
import { useDb } from '../db'

export default defineEventHandler(async () => {
  let db: 'ok' | 'error' = 'ok'
  try {
    await useDb().execute(sql`select 1`)
  } catch {
    db = 'error'
  }
  return { ok: db === 'ok', db, time: new Date().toISOString() }
})

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function useDb() {
  if (_db) return _db
  const url = useRuntimeConfig().databaseUrl || process.env.DATABASE_URL
  if (!url) {
    throw createError({ statusCode: 500, statusMessage: 'DATABASE_URL is not configured' })
  }
  // Supabase transaction pooler does not support prepared statements.
  const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 })
  _db = drizzle(client, { schema })
  return _db
}

export { schema }
export type Db = ReturnType<typeof useDb>

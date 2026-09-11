import type { H3Event } from 'h3'
import { timingSafeEqual } from 'node:crypto'

/** Single-user deployment: fixed user id (kept as a column so multi-user stays possible). */
export const USER_ID = '00000000-0000-0000-0000-000000000001'

export async function requireUser(event: H3Event) {
  await requireUserSession(event)
  return USER_ID
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function requireCronSecret(event: H3Event) {
  const cfg = useRuntimeConfig()
  const header = getHeader(event, 'authorization') || ''
  const q = getQuery(event)
  const provided = header.replace(/^Bearer\s+/i, '') || String(q.secret || '')
  if (!cfg.cronSecret || !safeEqual(provided, cfg.cronSecret)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}

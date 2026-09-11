import { z } from 'zod'

const bodySchema = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(200)
})

const attempts = new Map<string, { count: number, resetAt: number }>()

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const username = body.username.trim()
  const password = body.password.trim()
  const cfg = useRuntimeConfig()
  if (!cfg.appUsername || !cfg.appPassword) {
    throw createError({ statusCode: 500, statusMessage: '登入帳密尚未設定' })
  }

  // Simple per-IP throttle: 10 attempts per 15 minutes
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const now = Date.now()
  const rec = attempts.get(ip)
  if (rec && rec.resetAt > now && rec.count >= 10) {
    throw createError({ statusCode: 429, statusMessage: '嘗試次數過多，請 15 分鐘後再試' })
  }

  const userOk = safeEqual(username, String(cfg.appUsername))
  const passOk = safeEqual(password, String(cfg.appPassword))
  if (!userOk || !passOk) {
    const next = rec && rec.resetAt > now ? { count: rec.count + 1, resetAt: rec.resetAt } : { count: 1, resetAt: now + 15 * 60_000 }
    attempts.set(ip, next)
    throw createError({ statusCode: 401, statusMessage: '帳號或密碼錯誤' })
  }

  attempts.delete(ip)
  await setUserSession(event, {
    user: { id: USER_ID, name: 'me' },
    loggedInAt: now
  })
  return { ok: true }
})

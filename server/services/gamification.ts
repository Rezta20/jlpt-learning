import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../db'
import { todayStr, addDays } from '../utils/dates'
import { XP_RULES, titleForXp } from '../../shared/plan'

export async function ensureUserStats(userId: string) {
  const db = useDb()
  const row = await db.query.userStats.findFirst({ where: eq(schema.userStats.userId, userId) })
  if (row) return row
  const [created] = await db.insert(schema.userStats).values({ userId }).onConflictDoNothing().returning()
  return created ?? (await db.query.userStats.findFirst({ where: eq(schema.userStats.userId, userId) }))!
}

export async function ensureDaily(userId: string, date = todayStr()) {
  const db = useDb()
  const row = await db.query.dailyProgress.findFirst({
    where: and(eq(schema.dailyProgress.userId, userId), eq(schema.dailyProgress.date, date))
  })
  if (row) return row
  const [created] = await db.insert(schema.dailyProgress).values({ userId, date }).onConflictDoNothing().returning()
  return created ?? (await db.query.dailyProgress.findFirst({
    where: and(eq(schema.dailyProgress.userId, userId), eq(schema.dailyProgress.date, date))
  }))!
}

/** Add XP and touch streak. Streak counts a day once any XP is earned. */
export async function addXp(userId: string, amount: number, opts: { answered?: number, correct?: number } = {}) {
  const db = useDb()
  const today = todayStr()
  const stats = await ensureUserStats(userId)
  await ensureDaily(userId, today)

  let streak = stats.streak
  if (stats.lastActiveDate !== today) {
    streak = stats.lastActiveDate === addDays(today, -1) ? stats.streak + 1 : 1
  }
  const longest = Math.max(stats.longestStreak, streak)

  await db.update(schema.userStats).set({
    xp: sql`${schema.userStats.xp} + ${amount}`,
    streak,
    longestStreak: longest,
    lastActiveDate: today,
    updatedAt: new Date()
  }).where(eq(schema.userStats.userId, userId))

  await db.update(schema.dailyProgress).set({
    xp: sql`${schema.dailyProgress.xp} + ${amount}`,
    answered: sql`${schema.dailyProgress.answered} + ${opts.answered ?? 0}`,
    correct: sql`${schema.dailyProgress.correct} + ${opts.correct ?? 0}`
  }).where(and(eq(schema.dailyProgress.userId, userId), eq(schema.dailyProgress.date, today)))
}

export function xpForAnswer(isCorrect: boolean, bucket?: string) {
  if (!isCorrect) return XP_RULES.wrong
  if (bucket === 'review' || bucket === 'mistake') return XP_RULES.reviewCorrect
  return XP_RULES.correct
}

export async function markBlockDone(userId: string, block: 'morning' | 'evening' | 'reading') {
  const db = useDb()
  const today = todayStr()
  const daily = await ensureDaily(userId, today)
  const field = block === 'morning' ? 'morningDone' : block === 'evening' ? 'eveningDone' : 'readingDone'
  if (daily[field]) return { alreadyDone: true, xp: 0 }
  const xp = block === 'morning' ? XP_RULES.dailyMorning : block === 'evening' ? XP_RULES.dailyEvening : XP_RULES.readingDone
  await db.update(schema.dailyProgress).set({ [field]: true })
    .where(and(eq(schema.dailyProgress.userId, userId), eq(schema.dailyProgress.date, today)))
  await addXp(userId, xp)
  return { alreadyDone: false, xp }
}

export async function statsSummary(userId: string) {
  const stats = await ensureUserStats(userId)
  const t = titleForXp(stats.xp)
  return {
    xp: stats.xp,
    streak: stats.streak,
    longestStreak: stats.longestStreak,
    levelEstimate: stats.levelEstimate,
    title: t.title,
    nextTitleAt: t.nextAt
  }
}

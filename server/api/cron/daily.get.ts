import { and, eq, gte, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db'
import { snapshotLevel } from '../../services/stats'
import { createJob, stepJob } from '../../services/jobs'
import { todayStr, addDays } from '../../utils/dates'
import { getPlanWeek } from '../../../shared/plan'

/**
 * Daily maintenance (Vercel Cron): snapshot level; make sure there are passages
 * scheduled for the next 3 days; top up question pools that run low.
 * Protected by NUXT_CRON_SECRET (Authorization: Bearer ...).
 */
export default defineEventHandler(async (event) => {
  requireCronSecret(event)
  const db = useDb()
  const out: Record<string, unknown> = {}
  out.snapshot = await snapshotLevel(USER_ID)

  const today = todayStr()
  const hasKey = !!(useRuntimeConfig().openaiApiKey || process.env.OPENAI_API_KEY)
  if (hasKey) {
    // passages for next 3 days
    const upcoming = await db.select({ n: sql<number>`count(*)::int` }).from(schema.passages)
      .where(and(gte(schema.passages.scheduledFor, today), sql`${schema.passages.scheduledFor} <= ${addDays(today, 3)}`))
    const have = upcoming[0]?.n ?? 0
    if (have < 3) {
      const job = await createJob('passages', { startDate: addDays(today, have) }, 3 - have)
      for (let i = 0; i < 3 - have; i++) await stepJob(job.id)
      out.passages = 3 - have
    }
    // top up question pools for the current week's levels (1 step each, keeps cost bounded)
    const week = getPlanWeek(today)
    const levels = week?.newLevels ?? ['N4']
    const topped: string[] = []
    for (const level of levels) {
      for (const type of ['vocab', 'grammar'] as const) {
        const unseen = await db.execute<{ n: number }>(sql`
          select count(*)::int as n from ${schema.questions} q
          left join ${schema.userQuestionState} uq on uq.question_id = q.id and uq.user_id = ${USER_ID}
          where q.level = ${level} and q.skill = ${type} and q.quality = 'ok' and uq.question_id is null
        `)
        if ((unseen[0]?.n ?? 0) < 60) {
          const job = await createJob('questions', { type, level }, 24)
          await stepJob(job.id)
          await stepJob(job.id)
          topped.push(`${level}/${type}`)
        }
      }
    }
    out.topped = topped
  }
  void eq
  return { ok: true, ...out }
})

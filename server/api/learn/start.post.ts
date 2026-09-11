import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db'
import { markLearned } from '../../services/srs'
import { createSession } from '../../services/session'
import { addXp, ensureDaily } from '../../services/gamification'
import { XP_RULES } from '../../../shared/plan'
import { todayStr } from '../../utils/dates'

const bodySchema = z.object({
  kpIds: z.array(z.string().uuid()).min(1).max(60),
  kind: z.enum(['vocab', 'grammar']),
  count: z.number().int().min(3).max(60).optional()
})

/**
 * Mark knowledge points as learned (starts their FSRS schedule) and open a
 * "learn" session drilling exactly those points.
 */
export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  let newlyLearned = 0
  for (const id of body.kpIds) {
    const before = await db.query.userKnowledgeState.findFirst({
      where: and(eq(schema.userKnowledgeState.userId, userId), eq(schema.userKnowledgeState.knowledgePointId, id))
    })
    if (!before?.learnedAt) newlyLearned++
    await markLearned(userId, id)
  }
  if (newlyLearned > 0) {
    await ensureDaily(userId)
    const today = todayStr()
    await db.update(schema.dailyProgress).set(
      body.kind === 'grammar'
        ? { grammarLearned: sql`${schema.dailyProgress.grammarLearned} + ${newlyLearned}` }
        : { newWordsLearned: sql`${schema.dailyProgress.newWordsLearned} + ${newlyLearned}` }
    ).where(and(eq(schema.dailyProgress.userId, userId), eq(schema.dailyProgress.date, today)))
    if (body.kind === 'grammar') await addXp(userId, XP_RULES.grammarLearned * newlyLearned)
  }
  const count = body.count ?? (body.kind === 'grammar' ? Math.min(20, body.kpIds.length * 5) : Math.min(30, body.kpIds.length))
  const s = await createSession({
    userId,
    mode: 'learn',
    count,
    skills: [body.kind],
    autoLevel: true,
    mix: true,
    kpIds: body.kpIds,
    ratios: { learn: 1, review: 0, mistake: 0, new: 0, stretch: 0, todayNew: 0 },
    extraConfig: { kind: body.kind }
  })
  return { id: s.id, newlyLearned }
})

import { fsrs, generatorParameters, createEmptyCard, Rating, State, type Card, type Grade } from 'ts-fsrs'
import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../db'

/**
 * FSRS scheduler for User × KnowledgePoint.
 * Desired retention 0.9; short-term learning steps enabled so a newly learned
 * point comes back within the same day / next day.
 */
const params = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 60, // exam is within ~90 days; cap intervals
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['10m', '1d'],
  relearning_steps: ['10m']
})
const scheduler = fsrs(params)

type UksRow = typeof schema.userKnowledgeState.$inferSelect

function rowToCard(row: UksRow): Card {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.lastReview ?? undefined
  }
}

/**
 * Map a single answer to an FSRS grade.
 * Wrong → Again. Correct & slow → Hard. Correct → Good. Correct & fast → Easy.
 */
export function gradeFor(isCorrect: boolean, responseMs: number, qtype: string): Grade {
  if (!isCorrect) return Rating.Again
  const fastMs = qtype === 'sentence_order' || qtype.startsWith('reading') ? 25_000 : 7_000
  const slowMs = qtype === 'sentence_order' || qtype.startsWith('reading') ? 90_000 : 25_000
  if (responseMs <= fastMs) return Rating.Easy
  if (responseMs >= slowMs) return Rating.Hard
  return Rating.Good
}

/** Mastery 0–100 derived from FSRS stability + accuracy (simple, monotone). */
export function computeMastery(row: { stability: number, attempts: number, correct: number, reps: number, state: number }) {
  if (row.attempts === 0 && row.reps === 0) return 0
  const acc = row.attempts > 0 ? row.correct / row.attempts : 0.5
  // stability in days → 0..1 (30 days ≈ 0.9)
  const stab = 1 - Math.exp(-row.stability / 12)
  const m = 100 * (0.55 * stab + 0.45 * acc)
  return Math.max(0, Math.min(100, Math.round(m)))
}

export async function ensureKnowledgeState(userId: string, kpId: string) {
  const db = useDb()
  const existing = await db.query.userKnowledgeState.findFirst({
    where: and(eq(schema.userKnowledgeState.userId, userId), eq(schema.userKnowledgeState.knowledgePointId, kpId))
  })
  if (existing) return existing
  const empty = createEmptyCard(new Date())
  const [row] = await db.insert(schema.userKnowledgeState).values({
    userId,
    knowledgePointId: kpId,
    due: empty.due,
    stability: empty.stability,
    difficulty: empty.difficulty,
    elapsedDays: empty.elapsed_days,
    scheduledDays: empty.scheduled_days,
    learningSteps: empty.learning_steps,
    reps: 0,
    lapses: 0,
    state: State.New
  }).onConflictDoNothing().returning()
  return row ?? (await db.query.userKnowledgeState.findFirst({
    where: and(eq(schema.userKnowledgeState.userId, userId), eq(schema.userKnowledgeState.knowledgePointId, kpId))
  }))!
}

/** Mark a knowledge point as "learned today" (explicit study), scheduling first review. */
export async function markLearned(userId: string, kpId: string) {
  const db = useDb()
  const row = await ensureKnowledgeState(userId, kpId)
  if (row.learnedAt) return row
  const card = rowToCard(row)
  const { card: next } = scheduler.next(card, new Date(), Rating.Good)
  const [updated] = await db.update(schema.userKnowledgeState).set({
    due: next.due,
    stability: next.stability,
    difficulty: next.difficulty,
    elapsedDays: next.elapsed_days,
    scheduledDays: next.scheduled_days,
    learningSteps: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    lastReview: next.last_review ?? new Date(),
    learnedAt: new Date(),
    lastSeenAt: new Date(),
    mastery: computeMastery({ stability: next.stability, attempts: row.attempts, correct: row.correct, reps: next.reps, state: next.state })
  }).where(and(eq(schema.userKnowledgeState.userId, userId), eq(schema.userKnowledgeState.knowledgePointId, kpId))).returning()
  return updated!
}

/**
 * Apply an answer to every knowledge point attached to a question.
 * Returns the updated rows.
 */
export async function applyAnswerToKnowledge(userId: string, kpIds: string[], isCorrect: boolean, responseMs: number, qtype: string) {
  const db = useDb()
  const grade = gradeFor(isCorrect, responseMs, qtype)
  const now = new Date()
  const unique = [...new Set(kpIds)]
  const updated = await Promise.all(unique.map(async (kpId) => {
    const row = await ensureKnowledgeState(userId, kpId)
    const card = rowToCard(row)
    // If the card is not due yet and answer is correct, we still record but only
    // advance the schedule if the review happened at least 60% through the interval.
    // This prevents "cramming" the same point 10 times in one session from
    // inflating stability.
    const attempts = row.attempts + 1
    const correct = row.correct + (isCorrect ? 1 : 0)
    let next = card
    const earlyRatio = card.scheduled_days > 0 && card.last_review
      ? (now.getTime() - card.last_review.getTime()) / (card.scheduled_days * 86400_000)
      : 1
    const shouldSchedule = !isCorrect || card.state === State.New || card.state === State.Learning || card.state === State.Relearning || earlyRatio >= 0.6
    if (shouldSchedule) {
      next = scheduler.next(card, now, grade).card
    }
    const mastery = computeMastery({ stability: next.stability, attempts, correct, reps: next.reps, state: next.state })
    const [saved] = await db.update(schema.userKnowledgeState).set({
      due: next.due,
      stability: next.stability,
      difficulty: next.difficulty,
      elapsedDays: next.elapsed_days,
      scheduledDays: next.scheduled_days,
      learningSteps: next.learning_steps,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      lastReview: shouldSchedule ? now : row.lastReview,
      attempts,
      correct,
      mastery,
      lastSeenAt: now,
      learnedAt: row.learnedAt ?? now
    }).where(and(eq(schema.userKnowledgeState.userId, userId), eq(schema.userKnowledgeState.knowledgePointId, kpId))).returning()
    return saved
  }))
  return updated.filter((row): row is UksRow => !!row)
}

/** Count due knowledge points by type. */
export async function countDue(userId: string) {
  const db = useDb()
  const rows = await db.execute<{ type: string, cnt: number, overdue: number }>(sql`
    select kp.type as type,
           count(*)::int as cnt,
           count(*) filter (where s.due < now() - interval '1 day')::int as overdue
    from ${schema.userKnowledgeState} s
    join ${schema.knowledgePoints} kp on kp.id = s.knowledge_point_id
    where s.user_id = ${userId} and s.due <= now() and s.state <> 0
    group by kp.type
  `)
  const res = { vocab: 0, grammar: 0, overdue: 0 }
  for (const r of rows) {
    if (r.type === 'vocab') res.vocab = r.cnt
    if (r.type === 'grammar') res.grammar = r.cnt
    res.overdue += r.overdue
  }
  return res
}

import { and, eq, sql, inArray, isNull, or, lte } from 'drizzle-orm'
import { useDb, schema } from '../db'
import { todayStr, startOfLocalDay } from '../utils/dates'
import { getPlanWeek, CHECKPOINTS, EXAM_DATE, daysBetween } from '../../shared/plan'
import { ensureDaily, statsSummary } from './gamification'
import { countDue } from './srs'
import type { TodayDto, KnowledgePointDto, Level, KpType } from '../../shared/types'

export function toKpDto(kp: typeof schema.knowledgePoints.$inferSelect, state?: typeof schema.userKnowledgeState.$inferSelect | null): KnowledgePointDto {
  return {
    id: kp.id,
    type: kp.type as KpType,
    level: kp.level as Level,
    term: kp.term,
    reading: kp.reading,
    meaningZh: kp.meaningZh,
    pos: kp.pos,
    content: kp.content,
    bookRefs: kp.bookRefs,
    videoUrl: kp.videoUrl,
    isExtra: kp.isExtra,
    contentReady: kp.contentReady,
    state: state
      ? {
          mastery: state.mastery,
          attempts: state.attempts,
          correct: state.correct,
          due: state.due?.toISOString() ?? null,
          reps: state.reps,
          lapses: state.lapses,
          learnedAt: state.learnedAt?.toISOString() ?? null,
          stateCode: state.state
        }
      : null
  }
}

/**
 * Today's grammar points: those learned today first, then unlearned ones from the
 * week's grammar levels (by priority), up to the plan's grammarPerDay.
 */
export async function todayGrammar(userId: string, limit?: number) {
  const db = useDb()
  const today = todayStr()
  const week = getPlanWeek(today)
  const perDay = limit ?? week?.grammarPerDay ?? 2
  if (perDay <= 0) return []
  const levels = week?.grammarLevels ?? ['N5', 'N4']
  const dayStart = startOfLocalDay(today)

  const learnedToday = await db.select({ kp: schema.knowledgePoints, s: schema.userKnowledgeState })
    .from(schema.userKnowledgeState)
    .innerJoin(schema.knowledgePoints, eq(schema.knowledgePoints.id, schema.userKnowledgeState.knowledgePointId))
    .where(and(
      eq(schema.userKnowledgeState.userId, userId),
      eq(schema.knowledgePoints.type, 'grammar'),
      sql`${schema.userKnowledgeState.learnedAt} >= ${dayStart.toISOString()}`
    ))
    .limit(perDay)

  const out = learnedToday.map(r => toKpDto(r.kp, r.s))
  if (out.length >= perDay) return out

  const remaining = perDay - out.length
  for (const level of levels) {
    if (out.length >= perDay) break
    const rows = await db.select({ kp: schema.knowledgePoints })
      .from(schema.knowledgePoints)
      .leftJoin(schema.userKnowledgeState, and(
        eq(schema.userKnowledgeState.knowledgePointId, schema.knowledgePoints.id),
        eq(schema.userKnowledgeState.userId, userId)
      ))
      .where(and(
        eq(schema.knowledgePoints.type, 'grammar'),
        eq(schema.knowledgePoints.level, level),
        or(isNull(schema.userKnowledgeState.knowledgePointId), isNull(schema.userKnowledgeState.learnedAt))
      ))
      .orderBy(sql`${schema.knowledgePoints.contentReady} desc`, schema.knowledgePoints.priority, schema.knowledgePoints.createdAt)
      .limit(remaining)
    for (const r of rows) {
      if (out.length >= perDay) break
      if (!out.some(o => o.id === r.kp.id)) out.push(toKpDto(r.kp, null))
    }
  }
  return out
}

/** Today's new vocabulary batch (not yet learned), prioritized. */
export async function todayVocab(userId: string, limit?: number) {
  const db = useDb()
  const today = todayStr()
  const week = getPlanWeek(today)
  const perDay = limit ?? week?.vocabPerDay ?? 20
  if (perDay <= 0) return []
  const levels = week?.vocabLevels ?? ['N5', 'N4']
  const dayStart = startOfLocalDay(today)

  const learnedToday = await db.select({ kp: schema.knowledgePoints, s: schema.userKnowledgeState })
    .from(schema.userKnowledgeState)
    .innerJoin(schema.knowledgePoints, eq(schema.knowledgePoints.id, schema.userKnowledgeState.knowledgePointId))
    .where(and(
      eq(schema.userKnowledgeState.userId, userId),
      eq(schema.knowledgePoints.type, 'vocab'),
      sql`${schema.userKnowledgeState.learnedAt} >= ${dayStart.toISOString()}`
    ))
    .orderBy(schema.userKnowledgeState.learnedAt)
    .limit(perDay)
  const out = learnedToday.map(r => toKpDto(r.kp, r.s))
  if (out.length >= perDay) return out

  for (const level of levels) {
    if (out.length >= perDay) break
    const rows = await db.select({ kp: schema.knowledgePoints })
      .from(schema.knowledgePoints)
      .leftJoin(schema.userKnowledgeState, and(
        eq(schema.userKnowledgeState.knowledgePointId, schema.knowledgePoints.id),
        eq(schema.userKnowledgeState.userId, userId)
      ))
      .where(and(
        eq(schema.knowledgePoints.type, 'vocab'),
        eq(schema.knowledgePoints.level, level),
        or(isNull(schema.userKnowledgeState.knowledgePointId), isNull(schema.userKnowledgeState.learnedAt)),
        // only words that already have at least one question
        sql`exists (select 1 from ${schema.questionKnowledgePoints} qk join ${schema.questions} q on q.id = qk.question_id where qk.knowledge_point_id = ${schema.knowledgePoints.id} and q.quality = 'ok')`
      ))
      .orderBy(schema.knowledgePoints.priority, schema.knowledgePoints.createdAt)
      .limit(perDay - out.length)
    for (const r of rows) out.push(toKpDto(r.kp, null))
  }
  return out
}

export async function buildToday(userId: string): Promise<TodayDto> {
  const db = useDb()
  const today = todayStr()
  const week = getPlanWeek(today)
  const [daily, stats, due, grammar, vocab] = await Promise.all([
    ensureDaily(userId, today),
    statsSummary(userId),
    countDue(userId),
    todayGrammar(userId),
    todayVocab(userId)
  ])
  const retry = await db.select({ n: sql<number>`count(*)::int` }).from(schema.userQuestionState)
    .where(and(eq(schema.userQuestionState.userId, userId), sql`${schema.userQuestionState.wrongStreak} > 0`, or(isNull(schema.userQuestionState.retryDue), lte(schema.userQuestionState.retryDue, new Date()))))

  const readingLevel = week?.readingLevel ?? 'N5'
  const readAlready = await db.select({ id: schema.passageReads.passageId }).from(schema.passageReads).where(eq(schema.passageReads.userId, userId))
  const readIds = readAlready.map(r => r.id)
  const avail = await db.select({ id: schema.passages.id }).from(schema.passages)
    .where(and(
      inArray(schema.passages.level, [readingLevel, 'N5', 'N4', 'N3'].slice(0, 4)),
      readIds.length ? sql`${schema.passages.id} not in (${sql.join(readIds.map(i => sql`${i}`), sql`, `)})` : sql`true`
    )).limit(1)

  const next = CHECKPOINTS.find(c => c.date >= today) ?? null
  return {
    date: today,
    week: week ? { index: week.index, title: week.title, focus: week.focus, startDate: week.startDate, endDate: week.endDate } : null,
    daysToExam: daysBetween(today, EXAM_DATE),
    progress: {
      answered: daily.answered,
      correct: daily.correct,
      xp: daily.xp,
      morningDone: daily.morningDone,
      eveningDone: daily.eveningDone,
      readingDone: daily.readingDone,
      newWordsLearned: daily.newWordsLearned,
      grammarLearned: daily.grammarLearned
    },
    stats,
    due: { ...due, retry: retry[0]?.n ?? 0 },
    todayGrammar: grammar,
    todayVocabCount: vocab.length,
    readingAvailable: avail.length > 0,
    checkpoint: next ? { date: next.date, label: next.label, ok: null, detail: next.detail } : null
  }
}

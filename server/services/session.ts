import { and, eq, inArray, sql } from 'drizzle-orm'
import { useDb, schema } from '../db'
import type { QuestionDto, SessionDto, AnswerResult, SessionMode, Level, Skill, QType } from '../../shared/types'
import { pickQuestions, type Picked, type Bucket } from './mixer'
import { applyAnswerToKnowledge } from './srs'
import { addXp, xpForAnswer } from './gamification'
import { XP_RULES } from '../../shared/plan'

export interface CreateSessionInput {
  userId: string
  mode: SessionMode
  count: number
  levels?: Level[]
  skills: Skill[]
  autoLevel?: boolean
  mix?: boolean
  ratios?: Partial<Record<Bucket, number>>
  kpIds?: string[]
  qtypes?: string[]
  timeLimitSec?: number | null
  block?: 'morning' | 'evening' | null
  explicitQuestionIds?: string[]
  extraConfig?: Record<string, unknown>
}

export async function createSession(input: CreateSessionInput) {
  const db = useDb()
  let picked: Picked[]
  if (input.explicitQuestionIds?.length) {
    picked = input.explicitQuestionIds.map(id => ({ id, bucket: 'new' as Bucket, kpIds: [] }))
  } else {
    picked = await pickQuestions({
      userId: input.userId,
      count: input.count,
      levels: input.levels,
      skills: input.skills,
      autoLevel: input.autoLevel ?? true,
      mix: input.mix ?? true,
      ratios: input.ratios,
      kpIds: input.kpIds,
      qtypes: input.qtypes
    })
  }
  if (!picked.length) {
    throw createError({ statusCode: 409, statusMessage: '題庫裡還沒有符合條件的題目，請先到後台生成題目。' })
  }
  const buckets: Record<string, Bucket> = {}
  for (const p of picked) buckets[p.id] = p.bucket
  const [row] = await db.insert(schema.sessions).values({
    userId: input.userId,
    mode: input.mode,
    config: {
      levels: input.levels ?? null,
      skills: input.skills,
      autoLevel: input.autoLevel ?? true,
      mix: input.mix ?? true,
      block: input.block ?? null,
      buckets,
      ...(input.extraConfig ?? {})
    },
    questionIds: picked.map(p => p.id),
    total: picked.length,
    timeLimitSec: input.timeLimitSec ?? null
  }).returning()
  return row!
}

export async function loadSession(userId: string, sessionId: string): Promise<SessionDto> {
  const db = useDb()
  const s = await db.query.sessions.findFirst({ where: and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)) })
  if (!s) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  const ids = s.questionIds
  const qs = ids.length
    ? await db.query.questions.findMany({ where: inArray(schema.questions.id, ids) })
    : []
  const passageIds = Array.from(new Set(qs.map(q => q.passageId).filter(Boolean))) as string[]
  const passages = passageIds.length
    ? await db.query.passages.findMany({ where: inArray(schema.passages.id, passageIds) })
    : []
  const kpLinks = ids.length
    ? await db.select({
        questionId: schema.questionKnowledgePoints.questionId,
        id: schema.knowledgePoints.id,
        term: schema.knowledgePoints.term,
        type: schema.knowledgePoints.type,
        level: schema.knowledgePoints.level
      }).from(schema.questionKnowledgePoints)
        .innerJoin(schema.knowledgePoints, eq(schema.knowledgePoints.id, schema.questionKnowledgePoints.knowledgePointId))
        .where(inArray(schema.questionKnowledgePoints.questionId, ids))
    : []
  const answered = await db.query.answers.findMany({ where: eq(schema.answers.sessionId, sessionId) })
  const answeredMap: SessionDto['answeredMap'] = {}
  for (const a of answered) answeredMap[a.questionId] = { chosenIndex: a.chosenIndex, isCorrect: a.isCorrect }

  const buckets = (s.config as Record<string, unknown>).buckets as Record<string, Bucket> | undefined
  const byId = new Map(qs.map(q => [q.id, q]))
  const questions: QuestionDto[] = ids.map((id) => {
    const q = byId.get(id)
    if (!q) return null
    const p = q.passageId ? passages.find(x => x.id === q.passageId) : null
    return {
      id: q.id,
      level: q.level as Level,
      skill: q.skill,
      qtype: q.qtype as QType,
      stem: q.stem,
      options: q.options,
      passage: p ? { id: p.id, title: p.title, body: p.body, tokens: p.tokens } : null,
      audioUrl: q.audioUrl,
      knowledgePoints: kpLinks.filter(k => k.questionId === q.id).map(k => ({ id: k.id, term: k.term, type: k.type, level: k.level as Level })),
      bucket: buckets?.[q.id]
    } satisfies QuestionDto
  }).filter(Boolean) as QuestionDto[]

  return {
    id: s.id,
    mode: s.mode,
    config: s.config,
    total: s.total,
    answered: s.answered,
    correct: s.correct,
    timeLimitSec: s.timeLimitSec,
    startedAt: s.startedAt.toISOString(),
    finishedAt: s.finishedAt?.toISOString() ?? null,
    questions,
    answeredMap
  }
}

export async function answerQuestion(userId: string, sessionId: string, questionId: string, chosenIndex: number, responseMs: number): Promise<AnswerResult> {
  const db = useDb()
  const s = await db.query.sessions.findFirst({ where: and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)) })
  if (!s) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  if (!s.questionIds.includes(questionId)) throw createError({ statusCode: 400, statusMessage: 'Question not in session' })
  const q = await db.query.questions.findFirst({ where: eq(schema.questions.id, questionId) })
  if (!q) throw createError({ statusCode: 404, statusMessage: 'Question not found' })

  const existing = await db.query.answers.findFirst({ where: and(eq(schema.answers.sessionId, sessionId), eq(schema.answers.questionId, questionId)) })
  const isCorrect = chosenIndex === q.answerIndex
  const extra = await db.query.explanations.findMany({ where: eq(schema.explanations.questionId, questionId) })
  const kpRows = await db.select({ id: schema.knowledgePoints.id, term: schema.knowledgePoints.term, type: schema.knowledgePoints.type, level: schema.knowledgePoints.level })
    .from(schema.questionKnowledgePoints)
    .innerJoin(schema.knowledgePoints, eq(schema.knowledgePoints.id, schema.questionKnowledgePoints.knowledgePointId))
    .where(eq(schema.questionKnowledgePoints.questionId, questionId))

  if (existing) {
    // Idempotent: return stored result without re-scoring
    const states = await db.query.userKnowledgeState.findMany({
      where: and(eq(schema.userKnowledgeState.userId, userId), inArray(schema.userKnowledgeState.knowledgePointId, kpRows.map(k => k.id).concat(['00000000-0000-0000-0000-000000000000'])))
    })
    return {
      isCorrect: existing.isCorrect,
      answerIndex: q.answerIndex,
      explanation: q.explanation,
      extraExplanations: extra.map(e => e.content),
      xpGained: 0,
      knowledgePoints: kpRows.map(k => ({ ...k, level: k.level as Level, mastery: states.find(s => s.knowledgePointId === k.id)?.mastery ?? 0 }))
    }
  }

  const now = new Date()
  const clampedMs = Math.max(0, Math.min(responseMs, 10 * 60_000))
  await db.insert(schema.answers).values({ userId, sessionId, questionId, chosenIndex, isCorrect, responseMs: clampedMs })

  // Question aggregate stats
  await db.update(schema.questions).set({
    timesAnswered: sql`${schema.questions.timesAnswered} + 1`,
    timesCorrect: sql`${schema.questions.timesCorrect} + ${isCorrect ? 1 : 0}`
  }).where(eq(schema.questions.id, questionId))

  // User × Question state
  const retryDue = isCorrect ? null : new Date(now.getTime() + 20 * 3600_000) // re-ask within ~1 day
  await db.insert(schema.userQuestionState).values({
    userId,
    questionId,
    seen: 1,
    correct: isCorrect ? 1 : 0,
    lastSeenAt: now,
    lastWrongAt: isCorrect ? null : now,
    wrongStreak: isCorrect ? 0 : 1,
    retryDue
  }).onConflictDoUpdate({
    target: [schema.userQuestionState.userId, schema.userQuestionState.questionId],
    set: {
      seen: sql`${schema.userQuestionState.seen} + 1`,
      correct: sql`${schema.userQuestionState.correct} + ${isCorrect ? 1 : 0}`,
      lastSeenAt: now,
      lastWrongAt: isCorrect ? sql`${schema.userQuestionState.lastWrongAt}` : now,
      wrongStreak: isCorrect ? 0 : sql`${schema.userQuestionState.wrongStreak} + 1`,
      retryDue
    }
  })

  // FSRS on knowledge points
  const states = await applyAnswerToKnowledge(userId, kpRows.map(k => k.id), isCorrect, clampedMs, q.qtype)

  // Session counters
  await db.update(schema.sessions).set({
    answered: sql`${schema.sessions.answered} + 1`,
    correct: sql`${schema.sessions.correct} + ${isCorrect ? 1 : 0}`,
    durationMs: sql`${schema.sessions.durationMs} + ${clampedMs}`
  }).where(eq(schema.sessions.id, sessionId))

  const bucket = ((s.config as Record<string, unknown>).buckets as Record<string, string> | undefined)?.[questionId]
  const xp = xpForAnswer(isCorrect, bucket)
  await addXp(userId, xp, { answered: 1, correct: isCorrect ? 1 : 0 })

  return {
    isCorrect,
    answerIndex: q.answerIndex,
    explanation: q.explanation,
    extraExplanations: extra.map(e => e.content),
    xpGained: xp,
    knowledgePoints: kpRows.map(k => ({ ...k, level: k.level as Level, mastery: states.find(s => s.knowledgePointId === k.id)?.mastery ?? 0 }))
  }
}

export async function finishSession(userId: string, sessionId: string) {
  const db = useDb()
  const s = await db.query.sessions.findFirst({ where: and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)) })
  if (!s) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  if (s.finishedAt) return { alreadyFinished: true, xp: 0, session: s }
  const [updated] = await db.update(schema.sessions).set({ finishedAt: new Date() }).where(eq(schema.sessions.id, sessionId)).returning()
  let xp = 0
  if (s.answered >= Math.min(5, s.total)) {
    xp = XP_RULES.sessionFinished
    await addXp(userId, xp)
  }
  return { alreadyFinished: false, xp, session: updated! }
}

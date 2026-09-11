import { and, eq, desc, sql, inArray, isNull } from 'drizzle-orm'
import { useDb, schema } from '../db'
import { todayStr } from '../utils/dates'
import { getPlanWeek } from '../../shared/plan'
import { createSession } from './session'
import { markBlockDone } from './gamification'
import { markLearned } from './srs'

export async function pickTodayPassage(userId: string) {
  const db = useDb()
  const today = todayStr()
  const week = getPlanWeek(today)
  const level = week?.readingLevel ?? 'N4'
  const readIds = (await db.select({ id: schema.passageReads.passageId }).from(schema.passageReads).where(eq(schema.passageReads.userId, userId))).map(r => r.id)
  const notRead = readIds.length ? sql`${schema.passages.id} not in (${sql.join(readIds.map(i => sql`${i}`), sql`, `)})` : sql`true`

  // 1) scheduled for today
  let p = await db.query.passages.findFirst({ where: and(eq(schema.passages.scheduledFor, today), notRead) })
  // 2) scheduled in the past and unread
  if (!p) p = await db.query.passages.findFirst({ where: and(sql`${schema.passages.scheduledFor} <= ${today}`, notRead, eq(schema.passages.source, 'ai')), orderBy: schema.passages.scheduledFor })
  // 3) any unread AI passage at this level, then adjacent levels
  if (!p) p = await db.query.passages.findFirst({ where: and(eq(schema.passages.level, level), notRead, eq(schema.passages.source, 'ai')), orderBy: schema.passages.createdAt })
  if (!p) p = await db.query.passages.findFirst({ where: and(notRead, eq(schema.passages.source, 'ai'), isNull(schema.passages.scheduledFor)), orderBy: schema.passages.createdAt })
  if (!p) p = await db.query.passages.findFirst({ where: and(notRead, eq(schema.passages.source, 'ai')), orderBy: desc(schema.passages.createdAt) })
  return p ?? null
}

export async function loadPassage(userId: string, passageId: string) {
  const db = useDb()
  const p = await db.query.passages.findFirst({ where: eq(schema.passages.id, passageId) })
  if (!p) throw createError({ statusCode: 404, statusMessage: '文章不存在' })
  const qs = await db.query.questions.findMany({ where: and(eq(schema.questions.passageId, passageId), eq(schema.questions.quality, 'ok')) })
  const read = await db.query.passageReads.findFirst({ where: and(eq(schema.passageReads.userId, userId), eq(schema.passageReads.passageId, passageId)) })

  // Find or create a reading session for this passage
  let session = await db.query.sessions.findFirst({
    where: and(eq(schema.sessions.userId, userId), eq(schema.sessions.mode, 'reading'), sql`${schema.sessions.config}->>'passageId' = ${passageId}`),
    orderBy: desc(schema.sessions.startedAt)
  })
  if (!session && qs.length) {
    session = await createSession({
      userId,
      mode: 'reading',
      count: qs.length,
      skills: ['reading'],
      explicitQuestionIds: qs.map(q => q.id),
      extraConfig: { passageId }
    })
  }
  const answered = session ? await db.query.answers.findMany({ where: eq(schema.answers.sessionId, session.id) }) : []
  const answeredMap: Record<string, { chosenIndex: number, isCorrect: boolean }> = {}
  for (const a of answered) answeredMap[a.questionId] = { chosenIndex: a.chosenIndex, isCorrect: a.isCorrect }

  // Map tokens to existing knowledge points (by term) so tapping can show mastery / "already in SRS"
  const surfaces = Array.from(new Set(p.tokens.map(t => t.s).filter(s => s.trim().length > 0 && !/^[\p{P}\s]+$/u.test(s))))
  const kps = surfaces.length
    ? await db.select({ id: schema.knowledgePoints.id, term: schema.knowledgePoints.term, learnedAt: schema.userKnowledgeState.learnedAt })
        .from(schema.knowledgePoints)
        .leftJoin(schema.userKnowledgeState, and(eq(schema.userKnowledgeState.knowledgePointId, schema.knowledgePoints.id), eq(schema.userKnowledgeState.userId, userId)))
        .where(and(eq(schema.knowledgePoints.type, 'vocab'), inArray(schema.knowledgePoints.term, surfaces)))
    : []
  const kpByTerm: Record<string, { id: string, learned: boolean }> = {}
  for (const k of kps) kpByTerm[k.term] = { id: k.id, learned: !!k.learnedAt }

  return {
    id: p.id,
    level: p.level,
    title: p.title,
    body: p.body,
    tokens: p.tokens,
    summaryZh: p.summaryZh,
    source: p.source,
    scheduledFor: p.scheduledFor,
    sessionId: session?.id ?? null,
    questions: qs.map(q => ({ id: q.id, stem: q.stem, options: q.options, qtype: q.qtype })),
    answeredMap,
    read: read ? { unknownTokens: read.unknownTokens, correct: read.correct, total: read.total, readAt: read.readAt } : null,
    kpByTerm
  }
}

export async function finishPassage(userId: string, passageId: string, unknownTokens: string[]) {
  const db = useDb()
  const session = await db.query.sessions.findFirst({
    where: and(eq(schema.sessions.userId, userId), eq(schema.sessions.mode, 'reading'), sql`${schema.sessions.config}->>'passageId' = ${passageId}`),
    orderBy: desc(schema.sessions.startedAt)
  })
  const correct = session?.correct ?? 0
  const total = session?.total ?? 0
  await db.insert(schema.passageReads).values({ userId, passageId, unknownTokens, correct, total })
    .onConflictDoUpdate({ target: [schema.passageReads.userId, schema.passageReads.passageId], set: { unknownTokens, correct, total, readAt: new Date() } })
  if (session && !session.finishedAt) {
    await db.update(schema.sessions).set({ finishedAt: new Date() }).where(eq(schema.sessions.id, session.id))
  }
  const r = await markBlockDone(userId, 'reading')
  return { xp: r.xp, correct, total }
}

/** Add a word tapped in a passage to the knowledge base + SRS. */
export async function addWordFromPassage(userId: string, passageId: string, surface: string, reading: string | undefined, meaning: string | undefined) {
  const db = useDb()
  const p = await db.query.passages.findFirst({ where: eq(schema.passages.id, passageId) })
  if (!p) throw createError({ statusCode: 404 })
  let kp = await db.query.knowledgePoints.findFirst({ where: and(eq(schema.knowledgePoints.type, 'vocab'), eq(schema.knowledgePoints.term, surface)) })
  if (!kp) {
    const [created] = await db.insert(schema.knowledgePoints).values({
      type: 'vocab',
      level: p.level as 'N5',
      term: surface,
      reading: reading || null,
      meaningZh: meaning || null,
      source: 'reading',
      content: {},
      contentReady: false,
      priority: -5 // learner-chosen words get generated first
    }).onConflictDoNothing().returning()
    kp = created ?? (await db.query.knowledgePoints.findFirst({ where: and(eq(schema.knowledgePoints.type, 'vocab'), eq(schema.knowledgePoints.term, surface)) }))!
  }
  await markLearned(userId, kp.id)
  // record as unknown token
  const read = await db.query.passageReads.findFirst({ where: and(eq(schema.passageReads.userId, userId), eq(schema.passageReads.passageId, passageId)) })
  const tokens = Array.from(new Set([...(read?.unknownTokens ?? []), surface]))
  await db.insert(schema.passageReads).values({ userId, passageId, unknownTokens: tokens })
    .onConflictDoUpdate({ target: [schema.passageReads.userId, schema.passageReads.passageId], set: { unknownTokens: tokens } })
  return kp
}

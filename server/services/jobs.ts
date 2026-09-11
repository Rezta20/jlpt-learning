import { and, desc, eq, sql, inArray } from 'drizzle-orm'
import { useDb, schema } from '../db'
import type { Level } from '../../shared/types'
import { generateQuestions, generateGrammarContent, generateVocabContent, generatePassage, kpsNeedingQuestions, kpsWithoutContent, kpsById, type KpBrief } from './ai/generate'
import { QTYPES_BY_SKILL } from '../../shared/types'
import { getPlanWeek } from '../../shared/plan'
import { todayStr, addDays } from '../utils/dates'
import { USER_ID } from '../utils/auth'

export type JobKind = 'questions' | 'grammar_content' | 'vocab_content' | 'passages'

export interface QuestionsJobParams {
  type: 'vocab' | 'grammar'
  level: Level
  qtypes?: string[]
  perKp?: number
  minQuestions?: number
  kpIds?: string[]
  model?: string
}
export interface ContentJobParams {
  level: Level
  model?: string
  kpIds?: string[]
}
export interface PassagesJobParams {
  level?: Level
  startDate?: string
  model?: string
}

export async function createJob(kind: JobKind, params: Record<string, unknown>, target: number) {
  const db = useDb()
  const [row] = await db.insert(schema.generationJobs).values({ kind, params, target, status: 'pending' }).returning()
  return row!
}

export async function listJobs(limit = 30) {
  const db = useDb()
  return db.query.generationJobs.findMany({ orderBy: desc(schema.generationJobs.createdAt), limit })
}

/** Perform one unit of work for a job. Safe to call repeatedly until status is done/failed. */
export async function stepJob(jobId: string) {
  const db = useDb()
  const job = await db.query.generationJobs.findFirst({ where: eq(schema.generationJobs.id, jobId) })
  if (!job) throw createError({ statusCode: 404 })
  if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') return job

  await db.update(schema.generationJobs).set({ status: 'running', updatedAt: new Date() }).where(eq(schema.generationJobs.id, jobId))
  try {
    let produced = 0
    let finished = false
    if (job.kind === 'questions') {
      const p = job.params as unknown as QuestionsJobParams
      const perKp = p.perKp ?? (p.type === 'grammar' ? 4 : 3)
      const minQ = p.minQuestions ?? (p.type === 'grammar' ? 8 : 5)
      const kpBatch = p.type === 'grammar' ? 4 : 6
      const kps = await kpsNeedingQuestions(p.type, p.level, kpBatch * 3, minQ, p.kpIds)
      const batch = kps.slice(0, kpBatch)
      if (!batch.length) {
        finished = true
      } else {
        const qtypes = p.qtypes?.length ? p.qtypes : defaultQtypes(p.type, batch)
        const res = await generateQuestions({
          level: p.level,
          skill: p.type,
          qtypes,
          kps: batch,
          perKp,
          model: p.model,
          sourceRef: `job:${jobId}`
        })
        produced = res.inserted
        if (res.inserted === 0 && res.skipped > 0) {
          // avoid infinite loops on the same KPs: bump their priority so others come first
          await db.update(schema.knowledgePoints).set({ priority: sql`${schema.knowledgePoints.priority} + 1` }).where(inArray(schema.knowledgePoints.id, batch.map(b => b.id)))
        }
      }
    } else if (job.kind === 'grammar_content' || job.kind === 'vocab_content') {
      const p = job.params as unknown as ContentJobParams
      const type = job.kind === 'grammar_content' ? 'grammar' : 'vocab'
      const batchSize = type === 'grammar' ? 5 : 20
      let kps: KpBrief[]
      if (p.kpIds?.length) {
        const all = await kpsById(p.kpIds)
        const readyIds = new Set((await db.query.knowledgePoints.findMany({ where: and(inArray(schema.knowledgePoints.id, p.kpIds), eq(schema.knowledgePoints.contentReady, true)) })).map(r => r.id))
        kps = all.filter(k => !readyIds.has(k.id)).slice(0, batchSize)
      } else {
        kps = await kpsWithoutContent(type, p.level, batchSize)
      }
      if (!kps.length) finished = true
      else {
        const res = type === 'grammar' ? await generateGrammarContent(kps, p.model) : await generateVocabContent(kps, p.model)
        produced = res.updated
        if (res.updated === 0) {
          // mark as ready to avoid infinite retry; content stays empty
          await db.update(schema.knowledgePoints).set({ contentReady: true }).where(inArray(schema.knowledgePoints.id, kps.map(k => k.id)))
        }
      }
    } else if (job.kind === 'passages') {
      const p = job.params as unknown as PassagesJobParams
      const dateStr = addDays(p.startDate ?? todayStr(), job.cursor)
      const week = getPlanWeek(dateStr)
      const level = p.level ?? week?.readingLevel ?? 'N4'
      const ctx = await passageContext(level)
      const topics = ['朝の習慣', '週末の予定', '仕事のミス', '天気と気分', '料理と買い物', '友達との約束', '旅行の思い出', '健康と運動', '駅でのできごと', '家族との会話', '新しい趣味', '引っ越し', 'アルバイト', 'スマホと生活', '季節の行事']
      const res = await generatePassage({
        level,
        targetKps: ctx.targetKps,
        grammarKps: ctx.grammarKps,
        reinforceWords: ctx.reinforceWords,
        scheduledFor: dateStr,
        model: p.model,
        topicHint: topics[(job.cursor + Math.floor(Math.random() * 3)) % topics.length]
      })
      produced = res.passageId ? 1 : 0
    }

    const newProduced = job.produced + produced
    const done = finished || newProduced >= job.target
    await db.update(schema.generationJobs).set({
      produced: newProduced,
      cursor: job.cursor + 1,
      status: done ? 'done' : 'running',
      updatedAt: new Date()
    }).where(eq(schema.generationJobs.id, jobId))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.update(schema.generationJobs).set({ status: 'failed', error: msg.slice(0, 1000), updatedAt: new Date() }).where(eq(schema.generationJobs.id, jobId))
  }
  return (await db.query.generationJobs.findFirst({ where: eq(schema.generationJobs.id, jobId) }))!
}

function defaultQtypes(type: 'vocab' | 'grammar', kps: KpBrief[]) {
  if (type === 'grammar') return ['grammar_form', 'sentence_order', 'contrast', 'grammar_form']
  const hasKanji = kps.some(k => /[\u4e00-\u9fff]/.test(k.term))
  const base = ['context', 'word_meaning', 'usage', 'paraphrase']
  return hasKanji ? ['kanji_reading', ...base] : base
}

/** Context for a daily passage: recently learned words, unknown words from previous reads, this week's grammar. */
async function passageContext(level: Level) {
  const db = useDb()
  const recent = await db.select({ kp: schema.knowledgePoints })
    .from(schema.userKnowledgeState)
    .innerJoin(schema.knowledgePoints, eq(schema.knowledgePoints.id, schema.userKnowledgeState.knowledgePointId))
    .where(and(eq(schema.userKnowledgeState.userId, USER_ID), eq(schema.knowledgePoints.type, 'vocab'), sql`${schema.userKnowledgeState.learnedAt} > now() - interval '5 days'`))
    .orderBy(desc(schema.userKnowledgeState.learnedAt))
    .limit(6)
  let targetKps: KpBrief[] = recent.map(r => ({ id: r.kp.id, term: r.kp.term, reading: r.kp.reading, meaningZh: r.kp.meaningZh, type: r.kp.type, level: r.kp.level }))
  if (targetKps.length < 5) {
    const fill = await db.query.knowledgePoints.findMany({
      where: and(eq(schema.knowledgePoints.type, 'vocab'), eq(schema.knowledgePoints.level, level)),
      orderBy: sql`random()`,
      limit: 6 - targetKps.length
    })
    targetKps = targetKps.concat(fill.map(r => ({ id: r.id, term: r.term, reading: r.reading, meaningZh: r.meaningZh, type: r.type, level: r.level })))
  }
  const week = getPlanWeek(todayStr())
  const gLevels = week?.grammarLevels ?? [level]
  const gRecent = await db.select({ kp: schema.knowledgePoints })
    .from(schema.userKnowledgeState)
    .innerJoin(schema.knowledgePoints, eq(schema.knowledgePoints.id, schema.userKnowledgeState.knowledgePointId))
    .where(and(eq(schema.userKnowledgeState.userId, USER_ID), eq(schema.knowledgePoints.type, 'grammar'), sql`${schema.userKnowledgeState.learnedAt} > now() - interval '10 days'`))
    .orderBy(desc(schema.userKnowledgeState.learnedAt))
    .limit(6)
  let grammarKps: KpBrief[] = gRecent.map(r => ({ id: r.kp.id, term: r.kp.term, reading: r.kp.reading, meaningZh: r.kp.meaningZh, type: r.kp.type, level: r.kp.level }))
  if (grammarKps.length < 4) {
    const fill = await db.query.knowledgePoints.findMany({
      where: and(eq(schema.knowledgePoints.type, 'grammar'), inArray(schema.knowledgePoints.level, gLevels)),
      orderBy: sql`random()`,
      limit: 5 - grammarKps.length
    })
    grammarKps = grammarKps.concat(fill.map(r => ({ id: r.id, term: r.term, reading: r.reading, meaningZh: r.meaningZh, type: r.type, level: r.level })))
  }
  const reads = await db.query.passageReads.findMany({ where: eq(schema.passageReads.userId, USER_ID), orderBy: desc(schema.passageReads.readAt), limit: 5 })
  const reinforceWords = Array.from(new Set(reads.flatMap(r => r.unknownTokens))).slice(0, 6)
  return { targetKps, grammarKps, reinforceWords }
}

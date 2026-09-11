import { and, eq, inArray } from 'drizzle-orm'
import { useDb, schema } from '../db'
import { pickQuestions, type Picked } from './mixer'
import type { Level } from '../../shared/types'

export type MockSection = 'language' | 'reading' | 'listening' | 'full'

const PLAN: Record<Exclude<MockSection, 'full'>, { minutes: number, parts: { skills: ('vocab' | 'grammar' | 'reading' | 'listening')[], count: number, qtypes?: string[] }[] }> = {
  language: {
    minutes: 25,
    parts: [
      { skills: ['vocab'], count: 18 },
      { skills: ['grammar'], count: 12 }
    ]
  },
  reading: {
    minutes: 25,
    parts: [{ skills: ['reading'], count: 9 }]
  },
  listening: {
    minutes: 15,
    parts: [{ skills: ['listening'], count: 10 }]
  }
}

export async function buildMock(userId: string, section: MockSection, level: Level) {
  const db = useDb()
  const sections: Exclude<MockSection, 'full'>[] = section === 'full' ? ['language', 'reading', 'listening'] : [section]
  const picked: Picked[] = []
  let minutes = 0
  const sectionOf: Record<string, string> = {}
  for (const sec of sections) {
    const plan = PLAN[sec]
    minutes += plan.minutes
    for (const part of plan.parts) {
      const rows = await pickQuestions({
        userId,
        count: part.count,
        levels: [level],
        skills: part.skills,
        autoLevel: false,
        mix: false,
        qtypes: part.qtypes,
        exclude: picked.map(p => p.id)
      }).catch(() => [] as Picked[])
      for (const r of rows) sectionOf[r.id] = sec
      picked.push(...rows)
    }
  }
  if (!picked.length) {
    throw createError({ statusCode: 409, statusMessage: '題庫還沒有足夠的題目可以組成模考，請先生成題目。' })
  }
  const [row] = await db.insert(schema.sessions).values({
    userId,
    mode: 'mock',
    config: { section, level, sections: sectionOf, buckets: Object.fromEntries(picked.map(p => [p.id, p.bucket])) },
    questionIds: picked.map(p => p.id),
    total: picked.length,
    timeLimitSec: minutes * 60
  }).returning()
  return row!
}

/** Convert a mock session into an estimated JLPT scaled score (0–60 per section). */
export async function scoreMock(userId: string, sessionId: string) {
  const db = useDb()
  const s = await db.query.sessions.findFirst({ where: and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)) })
  if (!s) throw createError({ statusCode: 404 })
  const answers = await db.query.answers.findMany({ where: eq(schema.answers.sessionId, sessionId) })
  const qs = s.questionIds.length ? await db.query.questions.findMany({ where: inArray(schema.questions.id, s.questionIds) }) : []
  const sectionOf = ((s.config as Record<string, unknown>).sections ?? {}) as Record<string, string>
  const bySection: Record<string, { total: number, correct: number }> = {}
  for (const q of qs) {
    const sec = sectionOf[q.id] ?? (q.skill === 'reading' ? 'reading' : q.skill === 'listening' ? 'listening' : 'language')
    bySection[sec] ??= { total: 0, correct: 0 }
    bySection[sec].total++
    const a = answers.find(x => x.questionId === q.id)
    if (a?.isCorrect) bySection[sec].correct++
  }
  const scaled: Record<string, number> = {}
  let sum = 0
  let sectionsCounted = 0
  for (const [sec, v] of Object.entries(bySection)) {
    if (!v.total) continue
    // JLPT scaled scores are not linear, but a linear estimate is enough for tracking trend.
    const sc = Math.round((v.correct / v.total) * 60)
    scaled[sec] = sc
    sum += sc
    sectionsCounted++
  }
  const estimateTotal = sectionsCounted ? Math.round((sum / (sectionsCounted * 60)) * 180) : 0
  return { bySection, scaled, estimateTotal, sectionsCounted }
}

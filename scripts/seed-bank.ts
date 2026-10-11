/**
 * Build a practice bank without calling OpenAI.
 * Vocab: kanji reading / orthography (short everyday stems only).
 * Grammar + reading: authored originals in scripts/data/.
 */
import { createHash } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import * as schema from '../server/db/schema'
import type { Explanation, ExampleSentence } from '../server/db/schema'
import { enrichExplanation } from '../shared/enrich-explanation'
import { isAwkwardSeedStem } from '../shared/practice-question'
import { GRAMMAR_QUESTIONS } from './data/grammar-questions'
import { PASSAGES } from './data/passages'

type Db = ReturnType<typeof import('drizzle-orm/postgres-js').drizzle<typeof schema>>

export function stemHash(stem: string, options: string[]) {
  const norm = (stem + '|' + [...options].sort().join('|')).replace(/\s+/g, '')
  return createHash('sha1').update(norm).digest('hex')
}

function hash32(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function rng(seed: string) {
  let a = hash32(seed)
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function pickN(pool: string[], correct: string, n: number, rand: () => number, prefer?: (s: string) => boolean): string[] {
  const uniq = Array.from(new Set(pool.filter(x => x && x !== correct)))
  const preferred = prefer ? uniq.filter(prefer) : []
  const rest = prefer ? uniq.filter(x => !prefer(x)) : uniq
  const ordered = shuffle(preferred, rand).concat(shuffle(rest, rand))
  return ordered.slice(0, n)
}

// ========== IMPROVED DISTRACTOR SELECTION (JLPT-STYLE) ==========

/**
 * Calculate phonetic similarity between two kana strings for JLPT-style reading distractors.
 * Returns score 0-1 (higher = more similar).
 */
function phoneticSimilarity(r1: string, r2: string): number {
  if (!r1 || !r2) return 0
  if (r1 === r2) return 1
  
  const normalize = (s: string) => s.replace(/[ゃゅょャュョ]/g, '').replace(/ー/g, '')
  const n1 = normalize(r1)
  const n2 = normalize(r2)
  
  // Levenshtein distance
  const matrix: number[][] = []
  for (let i = 0; i <= n1.length; i++) matrix[i] = [i]
  for (let j = 0; j <= n2.length; j++) matrix[0]![j] = j
  
  for (let i = 1; i <= n1.length; i++) {
    for (let j = 1; j <= n2.length; j++) {
      const cost = n1[i - 1] === n2[j - 1] ? 0 : 1
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      )
    }
  }
  
  const maxLen = Math.max(n1.length, n2.length)
  return maxLen === 0 ? 0 : 1 - (matrix[n1.length]![n2.length]! / maxLen)
}

/**
 * Check if two strings share common kanji (for visual similarity).
 */
function sharedKanji(term1: string, term2: string): number {
  const kanji1 = term1.match(/[\u4e00-\u9fff]/g) || []
  const kanji2 = term2.match(/[\u4e00-\u9fff]/g) || []
  const set1 = new Set(kanji1)
  const set2 = new Set(kanji2)
  let shared = 0
  for (const k of set1) if (set2.has(k)) shared++
  return shared
}

/**
 * JLPT-style reading distractor picker: prefer phonetically similar readings.
 */
function pickReadingDistractors(
  vocabs: VocabRow[],
  correct: string,
  targetTerm: string,
  n: number,
  rand: () => number
): string[] {
  const correctNorm = correct.trim()
  const candidates = vocabs
    .filter(v => v.reading && v.reading !== correctNorm && v.term !== targetTerm)
    .map(v => {
      const r = v.reading!.trim()
      const lengthScore = 1 - Math.abs(r.length - correctNorm.length) / Math.max(r.length, correctNorm.length, 1)
      const phoneticScore = phoneticSimilarity(correctNorm, r)
      const hasKanjiInTerm = /[\u4e00-\u9fff]/.test(v.term)
      const termScore = hasKanjiInTerm ? 1 : 0.5 // prefer kanji terms for kanji reading questions
      
      return {
        reading: r,
        score: phoneticScore * 0.6 + lengthScore * 0.3 + termScore * 0.1
      }
    })
    .filter(c => c.score > 0)
  
  candidates.sort((a, b) => b.score - a.score)
  
  // Take top candidates with some randomness
  const topN = Math.min(candidates.length, n * 3)
  const pool = candidates.slice(0, topN).map(c => c.reading)
  return shuffle(pool, rand).slice(0, n)
}

/**
 * JLPT-style orthography distractor picker: prefer visually similar kanji terms.
 */
function pickOrthoDistractors(
  vocabs: VocabRow[],
  correct: string,
  correctReading: string,
  n: number,
  rand: () => number
): string[] {
  const correctNorm = correct.trim()
  const candidates = vocabs
    .filter(v => hasKanji(v.term) && v.term !== correctNorm)
    .map(v => {
      const lengthScore = 1 - Math.abs(v.term.length - correctNorm.length) / Math.max(v.term.length, correctNorm.length, 1)
      const sharedScore = sharedKanji(correctNorm, v.term) / Math.max(correctNorm.length, v.term.length, 1)
      const readingScore = v.reading ? phoneticSimilarity(correctReading, v.reading) : 0
      
      return {
        term: v.term,
        score: sharedScore * 0.5 + lengthScore * 0.3 + readingScore * 0.2
      }
    })
    .filter(c => c.score > 0)
  
  candidates.sort((a, b) => b.score - a.score)
  
  const topN = Math.min(candidates.length, n * 3)
  const pool = candidates.slice(0, topN).map(c => c.term)
  return shuffle(pool, rand).slice(0, n)
}

function place(correct: string, distractors: string[], rand: () => number): { options: string[], answerIndex: number } | null {
  const opts = [correct, ...distractors.filter(d => d && d !== correct)]
  if (opts.length < 4) return null
  const options = shuffle(opts.slice(0, 4), rand)
  return { options, answerIndex: options.indexOf(correct) }
}

function isolatedOccurrence(ja: string, term: string) {
  const i = ja.indexOf(term)
  if (i < 0) return false
  const before = ja[i - 1] ?? ''
  const after = ja[i + term.length] ?? ''
  const kanji = /[\u4e00-\u9fff]/
  if (kanji.test(before) && kanji.test(term[0] ?? '')) return false
  if (kanji.test(after) && kanji.test(term[term.length - 1] ?? '')) return false
  return true
}

function exampleWithTerm(v: VocabRow) {
  return v.content?.examples?.find(e => isolatedOccurrence(e.ja, v.term))
}

function usableExample(ja: string | undefined, term: string) {
  if (!ja || !isolatedOccurrence(ja, term)) return false
  if (isAwkwardSeedStem(ja)) return false
  return ja.replace(/\s+/g, '').length <= 42
}

const hasKanji = (s: string) => /[\u4e00-\u9fff]/.test(s)

function explainReading(v: VocabRow, options: string[], answerIndex: number, vocabs: VocabRow[], stem?: string, stemMeaning?: ExampleSentence): Explanation {
  const reading = (v.reading || '').trim()
  const base: Explanation = {
    whyCorrect: `【${v.term}】的正確讀音是「${reading}」。`,
    whyWrong: options.map((o, i) => (i === answerIndex ? '' : `「${o}」不是「${v.term}」的讀音。`)),
    coreConcept: `${v.term}＝${reading}`,
    examples: [],
    memoryTip: '先看清長音、促音、濁音，不要只記漢字長相。'
  }
  return enrichExplanation({
    explanation: base,
    options,
    answerIndex,
    qtype: 'kanji_reading',
    stem,
    vocabs,
    target: v,
    stemMeaning
  })
}

function explainOrtho(v: VocabRow, options: string[], answerIndex: number, vocabs: VocabRow[], stem?: string, stemMeaning?: ExampleSentence): Explanation {
  const reading = (v.reading || '').trim()
  const base: Explanation = {
    whyCorrect: `讀作「${reading}」時，正確寫法是「${v.term}」。`,
    whyWrong: options.map((o, i) => (i === answerIndex ? '' : `「${o}」不是「${reading}」這個詞的漢字。`)),
    coreConcept: `${reading}＝${v.term}`,
    examples: [],
    memoryTip: '形近字先比部首，再比讀音。'
  }
  return enrichExplanation({
    explanation: base,
    options,
    answerIndex,
    qtype: 'orthography',
    stem,
    vocabs,
    target: v,
    stemMeaning
  })
}

type VocabRow = {
  id: string
  term: string
  reading: string | null
  meaningZh: string | null
  pos: string | null
  level: string
  content: { examples?: { ja: string, zh: string }[], coreMeaning?: string, usageScene?: string, memo?: string }
}

type QRow = {
  level: string
  skill: 'vocab' | 'grammar' | 'reading'
  qtype: string
  stem: string
  options: string[]
  answerIndex: number
  explanation: Explanation
  source: string
  sourceRef: string
  stemHash: string
  kpId: string
  passageId?: string
}

async function flushQuestions(db: Db, rows: QRow[]) {
  let inserted = 0
  let linked = 0
  const chunkSize = 80
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const values = chunk.map(r => ({
      level: r.level,
      skill: r.skill,
      qtype: r.qtype,
      stem: r.stem,
      options: r.options,
      answerIndex: r.answerIndex,
      explanation: r.explanation,
      source: r.source,
      sourceRef: r.sourceRef,
      stemHash: r.stemHash,
      passageId: r.passageId ?? null
    }))
    const ret = await db.insert(schema.questions).values(values).onConflictDoUpdate({
      target: schema.questions.stemHash,
      set: { explanation: sql`excluded.explanation` },
      setWhere: sql`${schema.questions.source} = 'seed'`
    }).returning({
      id: schema.questions.id,
      stemHash: schema.questions.stemHash
    })
    inserted += ret.length
    const kpByHash = new Map(chunk.map(r => [r.stemHash, r.kpId]))
    const links = ret.map(r => {
      const kpId = kpByHash.get(r.stemHash)
      return kpId ? { questionId: r.id, knowledgePointId: kpId } : null
    }).filter(Boolean) as { questionId: string, knowledgePointId: string }[]
    if (links.length) {
      await db.insert(schema.questionKnowledgePoints).values(links).onConflictDoNothing()
      linked += links.length
    }
  }
  return { inserted, linked }
}

function buildVocabQuestions(vocabs: VocabRow[]): QRow[] {
  const out: QRow[] = []

  for (const v of vocabs) {
    const reading = (v.reading || '').trim()
    const rand = rng(v.id + v.term)

    if (hasKanji(v.term) && reading) {
      // === KANJI READING QUESTION (improved distractor selection) ===
      const dRead = pickReadingDistractors(vocabs, reading, v.term, 3, rand)
      const placedR = place(reading, dRead, rand)
      if (placedR) {
        const example = exampleWithTerm(v)
        const useEx = usableExample(example?.ja, v.term)
        const stem = useEx && example
          ? example.ja.replace(v.term, `【${v.term}】`)
          : `次の文の【　　】の漢字の読み方として最もよいものを選んでください。\n【${v.term}】`
        out.push({
          level: v.level,
          skill: 'vocab',
          qtype: 'kanji_reading',
          stem,
          options: placedR.options,
          answerIndex: placedR.answerIndex,
          explanation: explainReading(v, placedR.options, placedR.answerIndex, vocabs, stem, useEx && example ? { ja: example.ja, zh: example.zh } : undefined),
          source: 'seed',
          sourceRef: 'bank:kanji_reading',
          stemHash: stemHash(stem, placedR.options),
          kpId: v.id
        })
      }

      // === ORTHOGRAPHY QUESTION (improved distractor selection) ===
      const dKan = pickOrthoDistractors(vocabs, v.term, reading, 3, rand)
      const placedK = place(v.term, dKan, rand)
      if (placedK) {
        const example = exampleWithTerm(v)
        const useEx = usableExample(example?.ja, v.term)
        const stem = useEx && example
          ? example.ja.replace(v.term, `【${reading}】`)
          : `次の文の【　　】のひらがなを漢字で書くとき、最もよいものを選んでください。\n【${reading}】`
        out.push({
          level: v.level,
          skill: 'vocab',
          qtype: 'orthography',
          stem,
          options: placedK.options,
          answerIndex: placedK.answerIndex,
          explanation: explainOrtho(v, placedK.options, placedK.answerIndex, vocabs, stem, useEx && example ? { ja: example.ja, zh: example.zh } : undefined),
          source: 'seed',
          sourceRef: 'bank:orthography',
          stemHash: stemHash(stem, placedK.options),
          kpId: v.id
        })
      }
    }
  }
  return out
}

async function seedVocabQuestions(db: Db) {
  const vocabs = await db.select({
    id: schema.knowledgePoints.id,
    term: schema.knowledgePoints.term,
    reading: schema.knowledgePoints.reading,
    meaningZh: schema.knowledgePoints.meaningZh,
    pos: schema.knowledgePoints.pos,
    level: schema.knowledgePoints.level,
    content: schema.knowledgePoints.content
  }).from(schema.knowledgePoints).where(eq(schema.knowledgePoints.type, 'vocab')) as VocabRow[]

  const rows = buildVocabQuestions(vocabs)
  const { inserted } = await flushQuestions(db, rows)
  console.log(`vocab questions prepared ${rows.length}, inserted ${inserted}`)
}

async function seedGrammarQuestions(db: Db) {
  const kps = await db.select({
    id: schema.knowledgePoints.id,
    term: schema.knowledgePoints.term,
    level: schema.knowledgePoints.level
  }).from(schema.knowledgePoints).where(eq(schema.knowledgePoints.type, 'grammar'))
  const byTerm = new Map(kps.map(k => [k.term, k]))
  const missing = new Set<string>()
  const rows: QRow[] = []
  for (const q of GRAMMAR_QUESTIONS) {
    const kp = byTerm.get(q.term)
    if (!kp) {
      missing.add(q.term)
      continue
    }
    const whyWrong = q.options.map((_, i) => q.wrong[i] ?? '')
    const explanation: Explanation = {
      whyCorrect: q.why,
      whyWrong,
      coreConcept: q.core,
      examples: q.examples ?? [],
      memoryTip: q.tip
    }
    rows.push({
      level: kp.level,
      skill: 'grammar',
      qtype: q.qtype,
      stem: q.stem,
      options: [...q.options],
      answerIndex: q.answer,
      explanation,
      source: 'seed',
      sourceRef: 'bank:grammar',
      stemHash: stemHash(q.stem, [...q.options]),
      kpId: kp.id
    })
  }
  const { inserted } = await flushQuestions(db, rows)
  if (missing.size) console.warn('grammar terms not in DB:', [...missing].join('、'))
  console.log(`grammar questions prepared ${rows.length}, inserted ${inserted}`)
}

function todayTw() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function seedPassages(db: Db) {
  const start = todayTw()
  let insertedP = 0
  let insertedQ = 0
  for (const p of PASSAGES) {
    const existing = await db.query.passages.findFirst({
      where: and(eq(schema.passages.title, p.title), eq(schema.passages.source, 'seed'))
    })
    const scheduledFor = addDays(start, p.dayOffset)
    let passageId = existing?.id
    if (!existing) {
      const [row] = await db.insert(schema.passages).values({
        level: p.level,
        title: p.title,
        body: p.body,
        tokens: p.tokens,
        summaryZh: p.summaryZh,
        targetKpIds: [],
        scheduledFor,
        source: 'seed'
      }).returning({ id: schema.passages.id })
      passageId = row!.id
      insertedP++
    } else if (!existing.scheduledFor) {
      await db.update(schema.passages).set({ scheduledFor }).where(eq(schema.passages.id, existing.id))
    }
    if (!passageId) continue
    const qRows: QRow[] = p.questions.map((q, i) => ({
      level: p.level,
      skill: 'reading' as const,
      qtype: 'reading_short',
      stem: q.stem,
      options: [...q.options],
      answerIndex: q.answer,
      explanation: {
        whyCorrect: q.why,
        whyWrong: q.wrong,
        coreConcept: q.core,
        examples: []
      },
      source: 'seed',
      sourceRef: `bank:passage:${p.title}:${i}`,
      stemHash: stemHash(passageId + q.stem, [...q.options]),
      kpId: '',
      passageId
    }))
    // reading questions have no KP — insert without junction
    const chunk = qRows.map(r => ({
      level: r.level,
      skill: r.skill,
      qtype: r.qtype,
      stem: r.stem,
      options: r.options,
      answerIndex: r.answerIndex,
      explanation: r.explanation,
      source: r.source,
      sourceRef: r.sourceRef,
      stemHash: r.stemHash,
      passageId: r.passageId
    }))
    const ret = await db.insert(schema.questions).values(chunk).onConflictDoNothing().returning({ id: schema.questions.id })
    insertedQ += ret.length
  }
  console.log(`passages inserted ${insertedP}, reading questions inserted ${insertedQ}`)
}

export async function seedQuestionBank(db: Db) {
  await seedVocabQuestions(db)
  await seedGrammarQuestions(db)
  await seedPassages(db)
}

async function main() {
  const { default: postgres } = await import('postgres')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  await import('dotenv/config')
  const url = process.env.NUXT_DATABASE_URL || process.env.DATABASE_URL
  if (!url) {
    console.error('NUXT_DATABASE_URL is not set')
    process.exit(1)
  }
  const client = postgres(url, { prepare: false, max: 3 })
  const db = drizzle(client, { schema })
  await seedQuestionBank(db as Db)
  const counts = await db.execute<{ skill: string, qtype: string, n: number }>(sql`
    select skill, qtype, count(*)::int as n from questions group by skill, qtype order by skill, qtype
  `)
  console.table(counts)
  await client.end()
}

const isMain = process.argv[1]?.includes('seed-bank')
if (isMain) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

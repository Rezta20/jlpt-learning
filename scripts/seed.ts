/**
 * Seed: single user, curated grammar points (N5–N3), and JLPT vocabulary lists
 * (OpenJLPT / Jonathan Waller lists, CC BY-SA 4.0).
 *
 *   npm run seed                 # user + grammar + vocab + question bank
 *   npm run seed -- vocab
 *   npm run seed -- grammar
 *   npm run seed -- questions
 *   npm run seed:questions       # question bank only
 */
import 'dotenv/config'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import * as schema from '../server/db/schema'
import { GRAMMAR } from './data/grammar'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const url = process.env.NUXT_DATABASE_URL || process.env.DATABASE_URL
if (!url) {
  console.error('NUXT_DATABASE_URL is not set')
  process.exit(1)
}
const client = postgres(url, { prepare: false, max: 3 })
const db = drizzle(client, { schema })

const only = process.argv[2]

function bookRef(code?: string) {
  if (!code) return []
  if (code === '初') return [{ book: '大家學標準日本語 初級本' }]
  const m = code.match(/^(中|高)(\d+)$/)
  if (!m) return []
  return [{ book: m[1] === '中' ? '大家學標準日本語 中級本' : '大家學標準日本語 高級本', lesson: Number(m[2]) }]
}

async function seedUser() {
  await db.insert(schema.users).values({ id: USER_ID, name: 'me' }).onConflictDoNothing()
  await db.insert(schema.userStats).values({ userId: USER_ID }).onConflictDoNothing()
  console.log('user ok')
}

async function seedGrammar() {
  let n = 0
  for (const [i, [term, level, meaningZh, connection, ref]] of GRAMMAR.entries()) {
    const refs = bookRef(ref)
    const existing = await db.query.knowledgePoints.findFirst({
      where: (kp, { and, eq }) => and(eq(kp.type, 'grammar'), eq(kp.term, term))
    })
    if (existing) {
      await db.update(schema.knowledgePoints).set({
        level,
        meaningZh,
        bookRefs: refs,
        isExtra: refs.length === 0,
        priority: i,
        content: existing.contentReady ? existing.content : { ...existing.content, coreMeaning: meaningZh, connection }
      }).where(sql`${schema.knowledgePoints.id} = ${existing.id}`)
    } else {
      await db.insert(schema.knowledgePoints).values({
        type: 'grammar',
        level,
        term,
        reading: null,
        meaningZh,
        content: { coreMeaning: meaningZh, connection },
        bookRefs: refs,
        isExtra: refs.length === 0,
        source: 'seed',
        contentReady: true,
        priority: i
      })
    }
    n++
  }
  console.log(`grammar: ${n}`)
}

interface OjVocab {
  word: string
  reading: string
  meanings: string[]
  level: string
  examples?: { ja: string, en: string }[]
}

async function fetchVocab(level: 'n5' | 'n4' | 'n3'): Promise<OjVocab[]> {
  const dir = join(process.cwd(), 'scripts', '.cache')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `openjlpt-vocab-${level}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const res = await fetch(`https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/${level}.json`)
  if (!res.ok) throw new Error(`download failed ${level}: ${res.status}`)
  const txt = await res.text()
  writeFileSync(file, txt)
  return JSON.parse(txt)
}

const hasKanji = (s: string) => /[\u4e00-\u9fff]/.test(s)

async function seedVocab() {
  for (const lv of ['n5', 'n4', 'n3'] as const) {
    const items = await fetchVocab(lv)
    const level = lv.toUpperCase() as 'N5' | 'N4' | 'N3'
    let n = 0
    const seen = new Set<string>()
    for (const [i, it] of items.entries()) {
      const term = it.word.trim()
      if (!term) continue
      const reading = (it.reading || '').trim() || null
      const key = `${term}|${reading ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      const examples = (it.examples ?? []).slice(0, 2).map(e => ({ ja: e.ja, zh: e.en }))
      // priority: words with kanji first for a Chinese speaker (cheap wins), then kana words
      const priority = (hasKanji(term) ? 0 : 1000) + i
      await db.insert(schema.knowledgePoints).values({
        type: 'vocab',
        level,
        term,
        reading,
        meaningZh: it.meanings.slice(0, 3).join('; '),
        pos: null,
        content: examples.length ? { examples } : {},
        source: 'seed:openjlpt',
        priority
      }).onConflictDoNothing()
      n++
    }
    console.log(`vocab ${level}: ${n}`)
  }
}

async function main() {
  await seedUser()
  if (!only || only === 'grammar') await seedGrammar()
  if (!only || only === 'vocab') await seedVocab()
  if (!only || only === 'questions' || only === 'bank') {
    const { seedQuestionBank } = await import('./seed-bank')
    await seedQuestionBank(db)
  }
  const counts = await db.execute<{ type: string, level: string, n: number }>(sql`select type, level, count(*)::int as n from knowledge_points group by type, level order by type, level`)
  console.table(counts)
  const qcounts = await db.execute<{ skill: string, n: number }>(sql`select skill, count(*)::int as n from questions group by skill order by skill`)
  console.table(qcounts)
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

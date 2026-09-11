import { z } from 'zod'
import { createHash } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db'
import { callStructured } from './client'
import { SYSTEM_BASE, QTYPE_SPEC, levelGuide, EXPLANATION_FORMAT } from './prompts'
import type { Level, Skill, Explanation, PassageToken } from '../../../shared/types'

// ---------- Schemas ----------
const exampleSchema = z.object({ ja: z.string(), zh: z.string() })
const confusableSchema = z.object({ term: z.string(), diff: z.string() })
const explanationSchema = z.object({
  whyCorrect: z.string(),
  whyWrong: z.array(z.string()),
  coreConcept: z.string(),
  examples: z.array(exampleSchema),
  confusables: z.array(confusableSchema),
  memoryTip: z.string()
})

const questionSchema = z.object({
  qtype: z.string(),
  stem: z.string(),
  options: z.array(z.string()),
  answerIndex: z.number().int(),
  explanation: explanationSchema,
  /** The knowledge point terms (from the provided list) this question tests. */
  targetTerms: z.array(z.string())
})
const questionsOut = z.object({ questions: z.array(questionSchema) })

export type KpBrief = { id: string, term: string, reading: string | null, meaningZh: string | null, type: 'vocab' | 'grammar', level: string, content?: Record<string, unknown> }

export function stemHash(stem: string, options: string[]) {
  const norm = (stem + '|' + [...options].sort().join('|')).replace(/\s+/g, '')
  return createHash('sha1').update(norm).digest('hex')
}

function sanitizeExplanation(e: z.infer<typeof explanationSchema>, optionCount: number): Explanation {
  const whyWrong = Array.from({ length: optionCount }, (_, i) => e.whyWrong[i] ?? '')
  return {
    whyCorrect: e.whyCorrect.trim(),
    whyWrong,
    coreConcept: e.coreConcept.trim(),
    examples: e.examples.slice(0, 3),
    confusables: e.confusables.slice(0, 3),
    memoryTip: e.memoryTip?.trim() || undefined
  }
}

// ---------- Question generation ----------
export interface GenQuestionsInput {
  level: Level
  skill: Skill
  qtypes: string[]
  kps: KpBrief[]
  perKp: number
  model?: string
  sourceRef?: string
}

export async function generateQuestions(input: GenQuestionsInput) {
  const db = useDb()
  const specs = input.qtypes.map(t => `- ${t}：${QTYPE_SPEC[t] ?? ''}`).join('\n')
  const kpList = input.kps.map((k) => {
    const extra = k.type === 'grammar' && k.content
      ? `（核心意思：${(k.content as { coreMeaning?: string }).coreMeaning ?? ''}；接續：${(k.content as { connection?: string }).connection ?? ''}）`
      : ''
    return `- ${k.term}${k.reading ? `（${k.reading}）` : ''}${k.meaningZh ? `：${k.meaningZh}` : ''}${extra}`
  }).join('\n')

  const user = `請為以下 ${input.kps.length} 個${input.skill === 'vocab' ? '單字' : '文法'}知識點各出 ${input.perKp} 題，總共 ${input.kps.length * input.perKp} 題。
等級：${input.level}。${levelGuide(input.level)}

知識點清單：
${kpList}

可用題型（每個知識點的 ${input.perKp} 題請盡量使用不同題型，在下列題型中輪流）：
${specs}

要求：
- 每題 4 個選項，answerIndex 為 0–3；正解位置要隨機分布，不要總是同一個位置。
- 每題 targetTerms 只能填上方清單中的 term（原文一致），至少一個。
- 句子中的其他詞彙不得超過 ${input.level} 等級太多。
- 題幹中用（　　）表示挖空；用【】標示底線詞。
- 「文の組み立て」題幹必須含有「＿＿＿ ＿＿＿ ★ ＿＿＿」四格且只有一個 ★。
${EXPLANATION_FORMAT}`

  const out = await callStructured(questionsOut, SYSTEM_BASE, user, {
    kind: 'questions',
    model: input.model,
    reasoning: 'low',
    maxOutputTokens: 16000
  })

  const termToKp = new Map(input.kps.map(k => [k.term, k]))
  let inserted = 0
  let skipped = 0
  for (const q of out.questions) {
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      skipped++
      continue
    }
    if (q.answerIndex < 0 || q.answerIndex > 3) {
      skipped++
      continue
    }
    const qtype = input.qtypes.includes(q.qtype) ? q.qtype : input.qtypes[0]!
    if (qtype === 'sentence_order' && !q.stem.includes('★')) {
      skipped++
      continue
    }
    const kpIds = Array.from(new Set(q.targetTerms.map(t => termToKp.get(t)?.id).filter(Boolean))) as string[]
    if (!kpIds.length) {
      // try fuzzy: term contained in stem/options
      const guess = input.kps.find(k => q.stem.includes(k.term) || q.options.some(o => o.includes(k.term)))
      if (guess) kpIds.push(guess.id)
      else {
        skipped++
        continue
      }
    }
    const hash = stemHash(q.stem, q.options)
    const [row] = await db.insert(schema.questions).values({
      level: input.level,
      skill: input.skill,
      qtype,
      stem: q.stem.trim(),
      options: q.options.map(o => o.trim()),
      answerIndex: q.answerIndex,
      explanation: sanitizeExplanation(q.explanation, 4),
      source: 'ai',
      sourceRef: input.sourceRef ?? null,
      stemHash: hash
    }).onConflictDoNothing().returning({ id: schema.questions.id })
    if (!row) {
      skipped++
      continue
    }
    await db.insert(schema.questionKnowledgePoints).values(kpIds.map(k => ({ questionId: row.id, knowledgePointId: k }))).onConflictDoNothing()
    inserted++
  }
  return { inserted, skipped, requested: input.kps.length * input.perKp }
}

// ---------- Grammar content ----------
const grammarContentSchema = z.object({
  items: z.array(z.object({
    term: z.string(),
    coreMeaning: z.string(),
    connection: z.string(),
    usageScene: z.string(),
    nuance: z.string(),
    examples: z.array(exampleSchema),
    confusables: z.array(confusableSchema),
    memo: z.string()
  }))
})

export async function generateGrammarContent(kps: KpBrief[], model?: string) {
  const db = useDb()
  const list = kps.map(k => `- ${k.term}（${k.level}）${k.meaningZh ? `：${k.meaningZh}` : ''}`).join('\n')
  const user = `請為以下 ${kps.length} 個日文文法點各寫一份「精簡解說」，對象是正在準備 JLPT N3、母語為台灣中文的自學者，他過去的問題是「讀完課本的解釋還是不知道實際怎麼用」。

文法點：
${list}

每個文法點輸出：
- term：與上方原文一致。
- coreMeaning：核心意思，一句台灣繁體中文（不超過 30 字）。
- connection：接續方式（例如「動詞辭書形＋ことにする」「名詞＋のせいで」），用日文文法術語加簡短中文。
- usageScene：什麼時候會用、常見場面，2–3 句。
- nuance：語感、說話者的心情或立場、正式／口語程度，1–3 句。
- examples：5 句情境例句，由簡到難，每句附台灣繁體中文翻譯，例句詞彙不超過該等級太多。
- confusables：1–3 個容易混淆的文法，term 為日文，diff 一句話講差別與判斷方法。
- memo：一句話的記憶提示或常見錯誤提醒。`

  const out = await callStructured(grammarContentSchema, SYSTEM_BASE, user, { kind: 'grammar_content', model, reasoning: 'low', maxOutputTokens: 16000 })
  let updated = 0
  for (const item of out.items) {
    const kp = kps.find(k => k.term === item.term) ?? kps.find(k => item.term.includes(k.term) || k.term.includes(item.term))
    if (!kp) continue
    await db.update(schema.knowledgePoints).set({
      content: {
        coreMeaning: item.coreMeaning,
        connection: item.connection,
        usageScene: item.usageScene,
        nuance: item.nuance,
        examples: item.examples.slice(0, 6),
        confusables: item.confusables.slice(0, 3),
        memo: item.memo
      },
      meaningZh: kp.meaningZh || item.coreMeaning,
      contentReady: true,
      updatedAt: new Date()
    }).where(eq(schema.knowledgePoints.id, kp.id))
    updated++
  }
  return { updated, requested: kps.length }
}

// ---------- Vocab content (zh meaning, pos, examples) ----------
const vocabContentSchema = z.object({
  items: z.array(z.object({
    term: z.string(),
    reading: z.string(),
    meaningZh: z.string(),
    pos: z.string(),
    examples: z.array(exampleSchema),
    confusables: z.array(confusableSchema),
    memo: z.string()
  }))
})

export async function generateVocabContent(kps: KpBrief[], model?: string) {
  const db = useDb()
  const list = kps.map(k => `- ${k.term}${k.reading ? `（${k.reading}）` : ''}${k.meaningZh ? `：${k.meaningZh}` : ''}（${k.level}）`).join('\n')
  const user = `請為以下 ${kps.length} 個 JLPT 單字補充學習資料，對象是台灣的自學者。

單字：
${list}

每個單字輸出：
- term：與上方原文一致。
- reading：平假名讀音（片假名詞就寫片假名）。
- meaningZh：台灣繁體中文意思，簡短，可用「；」分隔多義（最多 3 個義項）。若原本已有英文或不精確意思，請改寫成自然的台灣用語。
- pos：詞性（名詞／動詞Ⅰ／動詞Ⅱ／動詞Ⅲ／い形容詞／な形容詞／副詞／接續詞／助詞／慣用句 等）。
- examples：3 句短例句，展示不同搭配或情境，每句附台灣繁體中文翻譯，例句其他詞彙不超過該等級。
- confusables：0–2 個形近、音近或意思相近容易搞混的詞，diff 一句話講差別。
- memo：一句話記憶提示（可用漢字聯想、常見搭配）。`

  const out = await callStructured(vocabContentSchema, SYSTEM_BASE, user, { kind: 'vocab_content', model, reasoning: 'minimal', maxOutputTokens: 16000 })
  let updated = 0
  for (const item of out.items) {
    const kp = kps.find(k => k.term === item.term)
    if (!kp) continue
    await db.update(schema.knowledgePoints).set({
      reading: kp.reading || item.reading,
      meaningZh: item.meaningZh,
      pos: item.pos,
      content: {
        examples: item.examples.slice(0, 4),
        confusables: item.confusables.slice(0, 2),
        memo: item.memo
      },
      contentReady: true,
      updatedAt: new Date()
    }).where(eq(schema.knowledgePoints.id, kp.id))
    updated++
  }
  return { updated, requested: kps.length }
}

// ---------- Reading passage ----------
const tokenSchema = z.object({
  s: z.string(),
  r: z.string(),
  m: z.string(),
  t: z.boolean()
})
const passageSchema = z.object({
  title: z.string(),
  body: z.string(),
  tokens: z.array(tokenSchema),
  summaryZh: z.string(),
  questions: z.array(z.object({
    stem: z.string(),
    options: z.array(z.string()),
    answerIndex: z.number().int(),
    explanation: explanationSchema
  }))
})

export interface GenPassageInput {
  level: Level
  targetKps: KpBrief[]
  grammarKps: KpBrief[]
  reinforceWords: string[]
  scheduledFor?: string | null
  model?: string
  topicHint?: string
}

export async function generatePassage(input: GenPassageInput) {
  const db = useDb()
  const words = input.targetKps.map(k => `${k.term}${k.reading ? `（${k.reading}）` : ''}`).join('、')
  const grammar = input.grammarKps.map(k => k.term).join('、')
  const lengthByLevel: Record<Level, string> = { N5: '120–180', N4: '180–260', N3: '250–350', N2: '350–450', N1: '450–600' }
  const user = `請寫一篇給 JLPT ${input.level} 學習者的每日短文，並附三題讀解選擇題。
${levelGuide(input.level)}

長度：${lengthByLevel[input.level]} 字（日文字數）。
${input.topicHint ? `主題方向：${input.topicHint}` : '主題：日常生活、工作、學校、旅行、天氣、飲食、購物、健康、朋友、家庭等貼近生活的內容，用第一人稱或簡單的說明文。'}

務必自然融入以下「目標單字」（每個至少出現一次）：${words || '（無）'}
盡量使用以下「本週文法」（至少使用其中 3 個）：${grammar || '（無）'}
${input.reinforceWords.length ? `另外請讓這些學習者之前不會的字再出現一次：${input.reinforceWords.join('、')}` : ''}

輸出：
- title：簡短日文標題。
- body：全文（含標點與換行），不要加註讀音。
- tokens：把 body 依「詞」切分成陣列，順序與原文完全一致，串接起來必須等於 body（標點、空格與換行也要作為獨立 token 保留，r 與 m 給空字串）。每個 token：s=原文、r=平假名讀音（假名詞或標點給空字串）、m=該詞在此處的台灣繁體中文意思（助詞可簡述功能，如「主題」「對象」；標點給空字串）、t=是否為目標單字或需再出現的字。
- summaryZh：全文台灣繁體中文摘要，2–3 句。
- questions：3 題，仿 JLPT 読解（主旨、細節、指示詞或作者想法各一），4 個選項為日文，answerIndex 0–3。
${EXPLANATION_FORMAT}`

  const out = await callStructured(passageSchema, SYSTEM_BASE, user, { kind: 'passage', model: input.model, reasoning: 'low', maxOutputTokens: 12000 })

  // Validate token concatenation; fallback to naive tokens if mismatch
  let tokens: PassageToken[] = out.tokens.map(t => ({ s: t.s, r: t.r || undefined, m: t.m || undefined, t: t.t || undefined }))
  const joined = tokens.map(t => t.s).join('')
  if (joined.replace(/\s+/g, '') !== out.body.replace(/\s+/g, '')) {
    tokens = fallbackTokens(out.body, tokens)
  }

  const [p] = await db.insert(schema.passages).values({
    level: input.level,
    title: out.title,
    body: out.body,
    tokens,
    summaryZh: out.summaryZh,
    targetKpIds: input.targetKps.map(k => k.id),
    scheduledFor: input.scheduledFor ?? null,
    source: 'ai'
  }).returning()

  let qCount = 0
  for (const q of out.questions) {
    if (q.options.length !== 4 || q.answerIndex < 0 || q.answerIndex > 3) continue
    const [row] = await db.insert(schema.questions).values({
      level: input.level,
      skill: 'reading',
      qtype: 'reading_short',
      stem: q.stem,
      passageId: p!.id,
      options: q.options,
      answerIndex: q.answerIndex,
      explanation: sanitizeExplanation(q.explanation, 4),
      source: 'ai',
      stemHash: stemHash(p!.id + q.stem, q.options)
    }).onConflictDoNothing().returning({ id: schema.questions.id })
    if (row) {
      // Link reading questions to target KPs so they count toward mastery lightly
      if (input.targetKps.length) {
        await db.insert(schema.questionKnowledgePoints).values(input.targetKps.slice(0, 3).map(k => ({ questionId: row.id, knowledgePointId: k.id }))).onConflictDoNothing()
      }
      qCount++
    }
  }
  return { passageId: p!.id, questions: qCount }
}

/** If the model's tokens do not reproduce the body, fall back to a per-character-run split that keeps known tokens where they match. */
function fallbackTokens(body: string, tokens: PassageToken[]): PassageToken[] {
  const out: PassageToken[] = []
  let i = 0
  let ti = 0
  while (i < body.length) {
    const t = tokens[ti]
    if (t && body.startsWith(t.s, i)) {
      out.push(t)
      i += t.s.length
      ti++
      continue
    }
    // try to find next token occurrence nearby
    const next = tokens.slice(ti, ti + 5).find(x => body.indexOf(x.s, i) >= 0 && body.indexOf(x.s, i) - i < 12)
    if (next) {
      const idx = body.indexOf(next.s, i)
      out.push({ s: body.slice(i, idx) })
      i = idx
      ti = tokens.indexOf(next)
      continue
    }
    out.push({ s: body[i]! })
    i++
  }
  return out
}

// ---------- Explain again ----------
export async function explainAgain(questionId: string, model?: string) {
  const db = useDb()
  const q = await db.query.questions.findFirst({ where: eq(schema.questions.id, questionId) })
  if (!q) throw createError({ statusCode: 404 })
  const prev = await db.query.explanations.findMany({ where: eq(schema.explanations.questionId, questionId) })
  const kps = await db.select({ kp: schema.knowledgePoints }).from(schema.questionKnowledgePoints)
    .innerJoin(schema.knowledgePoints, eq(schema.knowledgePoints.id, schema.questionKnowledgePoints.knowledgePointId))
    .where(eq(schema.questionKnowledgePoints.questionId, questionId))
  const user = `學習者看了下面這題的解釋之後說「我還是不懂」。請用完全不同的角度再解釋一次：可以用比喻、用中文對照、用「錯誤選項放進句子會變成什麼意思」的方式示範，或拆解句子結構。語氣像老師面對面講，短句、直接。

題目：${q.stem}
選項：${q.options.map((o, i) => `${i}. ${o}`).join('　')}
正解：${q.answerIndex}
考點：${kps.map(k => `${k.kp.term}${k.kp.meaningZh ? `（${k.kp.meaningZh}）` : ''}`).join('、')}

原本的解釋：${JSON.stringify(q.explanation)}
${prev.length ? `之前追加過的解釋（不要重複同樣角度）：${JSON.stringify(prev.map(p => p.content))}` : ''}

${EXPLANATION_FORMAT}`
  const out = await callStructured(explanationSchema, SYSTEM_BASE, user, { kind: 'explain_again', refId: questionId, model, reasoning: 'low', maxOutputTokens: 4000 })
  const content = sanitizeExplanation(out, q.options.length)
  const [row] = await db.insert(schema.explanations).values({ questionId, version: prev.length + 2, content }).returning()
  return row!.content
}

// ---------- Import text: tokenize + optional questions ----------
const importSchema = z.object({
  title: z.string(),
  tokens: z.array(tokenSchema),
  summaryZh: z.string(),
  level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']),
  questions: z.array(z.object({
    stem: z.string(),
    options: z.array(z.string()),
    answerIndex: z.number().int(),
    explanation: explanationSchema
  }))
})

export async function parseImportedText(importId: string, text: string, withQuestions: boolean, model?: string) {
  const db = useDb()
  const user = `以下是學習者貼上的一段日文。請：
1. 判斷大致 JLPT 等級（level）。
2. 給一個簡短日文標題（title）。
3. 依「詞」切分成 tokens，順序與原文完全一致，串接起來必須等於原文（標點、空格、換行也作為獨立 token，r 與 m 給空字串）。每個 token：s=原文、r=平假名讀音（假名詞或標點給空字串）、m=該詞在此處的台灣繁體中文意思（助詞簡述功能；標點給空字串）、t 一律 false。
4. summaryZh：台灣繁體中文摘要 2–3 句。
5. questions：${withQuestions ? '3 題仿 JLPT 読解選擇題（4 個日文選項，answerIndex 0–3）。' : '給空陣列。'}
${withQuestions ? EXPLANATION_FORMAT : ''}

原文：
${text}`
  const out = await callStructured(importSchema, SYSTEM_BASE, user, { kind: 'import_parse', refId: importId, model, reasoning: 'minimal', maxOutputTokens: 12000 })
  let tokens: PassageToken[] = out.tokens.map(t => ({ s: t.s, r: t.r || undefined, m: t.m || undefined }))
  if (tokens.map(t => t.s).join('').replace(/\s+/g, '') !== text.replace(/\s+/g, '')) tokens = fallbackTokens(text, tokens)
  const [p] = await db.insert(schema.passages).values({
    level: out.level,
    title: out.title,
    body: text,
    tokens,
    summaryZh: out.summaryZh,
    targetKpIds: [],
    source: 'import'
  }).returning()
  let qCount = 0
  for (const q of out.questions) {
    if (q.options.length !== 4 || q.answerIndex < 0 || q.answerIndex > 3) continue
    const [row] = await db.insert(schema.questions).values({
      level: out.level,
      skill: 'reading',
      qtype: 'reading_short',
      stem: q.stem,
      passageId: p!.id,
      options: q.options,
      answerIndex: q.answerIndex,
      explanation: sanitizeExplanation(q.explanation, 4),
      source: 'import',
      sourceRef: importId,
      stemHash: stemHash(p!.id + q.stem, q.options)
    }).onConflictDoNothing().returning({ id: schema.questions.id })
    if (row) qCount++
  }
  await db.update(schema.imports).set({ status: 'parsed', passageId: p!.id, title: out.title }).where(eq(schema.imports.id, importId))
  return { passageId: p!.id, questions: qCount, level: out.level }
}

// ---------- Helpers to select KPs for generation ----------
export async function kpsNeedingQuestions(type: 'vocab' | 'grammar', level: Level, limit: number, minQuestions: number, ids?: string[]) {
  const db = useDb()
  const rows = await db.execute<{ id: string, term: string, reading: string | null, meaning_zh: string | null, type: 'vocab' | 'grammar', level: string, content: Record<string, unknown>, qn: number }>(sql`
    select kp.id, kp.term, kp.reading, kp.meaning_zh, kp.type, kp.level, kp.content,
      (select count(*)::int from ${schema.questionKnowledgePoints} qk join ${schema.questions} q on q.id = qk.question_id where qk.knowledge_point_id = kp.id and q.quality = 'ok') as qn
    from ${schema.knowledgePoints} kp
    where kp.type = ${type} and kp.level = ${level}
      ${ids?.length ? sql`and kp.id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})` : sql``}
    order by qn asc, kp.priority asc, kp.created_at asc
    limit ${limit}
  `)
  return (rows as unknown as Array<{ id: string, term: string, reading: string | null, meaning_zh: string | null, type: 'vocab' | 'grammar', level: string, content: Record<string, unknown>, qn: number }>)
    .filter(r => r.qn < minQuestions)
    .map(r => ({ id: r.id, term: r.term, reading: r.reading, meaningZh: r.meaning_zh, type: r.type, level: r.level, content: r.content, qn: r.qn }))
}

export async function kpsById(ids: string[]): Promise<KpBrief[]> {
  if (!ids.length) return []
  const db = useDb()
  const rows = await db.query.knowledgePoints.findMany({ where: inArray(schema.knowledgePoints.id, ids) })
  return rows.map(r => ({ id: r.id, term: r.term, reading: r.reading, meaningZh: r.meaningZh, type: r.type, level: r.level, content: r.content as Record<string, unknown> }))
}

export async function kpsWithoutContent(type: 'vocab' | 'grammar', level: Level, limit: number) {
  const db = useDb()
  const rows = await db.query.knowledgePoints.findMany({
    where: and(eq(schema.knowledgePoints.type, type), eq(schema.knowledgePoints.level, level), eq(schema.knowledgePoints.contentReady, false)),
    orderBy: [schema.knowledgePoints.priority, schema.knowledgePoints.createdAt],
    limit
  })
  return rows.map(r => ({ id: r.id, term: r.term, reading: r.reading, meaningZh: r.meaningZh, type: r.type, level: r.level, content: r.content as Record<string, unknown> }))
}

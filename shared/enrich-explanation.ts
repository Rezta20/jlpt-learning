import type { ExampleSentence, Explanation, KnowledgeContent, OptionNote } from './types'
import { displayMeaning } from './vocab-display'

export const ENRICH_QTYPES = new Set(['orthography', 'kanji_reading', 'context'])

export type VocabBrief = {
  term: string
  reading: string | null
  meaningZh: string | null
  pos: string | null
  content?: KnowledgeContent | null
}

export function shouldEnrichQtype(qtype: string) {
  return ENRICH_QTYPES.has(qtype)
}

export function enrichExplanation(input: {
  explanation: Explanation
  options: string[]
  answerIndex: number
  qtype: string
  stem?: string
  vocabs: VocabBrief[]
  target?: VocabBrief | null
  stemMeaning?: ExampleSentence
}): Explanation {
  const { explanation, options, answerIndex, qtype } = input
  if (!shouldEnrichQtype(qtype)) return explanation

  const index = indexVocabs(input.vocabs)
  const target = input.target
    ?? lookupOption(options[answerIndex] ?? '', qtype, index)
    ?? null

  const fill = target?.term || options[answerIndex] || ''
  const stemMeaning = input.stemMeaning?.zh
    ? input.stemMeaning
    : findStemMeaning(input.stem, target, fill)

  const whyWrong = options.map((option, i) => {
    if (i === answerIndex) return ''
    const vocab = lookupOption(option, qtype, index, target)
    return whyWrongLine(qtype, option, vocab, target) || explanation.whyWrong?.[i] || ''
  })

  const optionNotes: OptionNote[] = options.map((option, i) => {
    if (i === answerIndex) return {}
    const vocab = lookupOption(option, qtype, index, target)
    if (!vocab) return {}
    return {
      reading: vocab.reading?.trim() || undefined,
      meaningZh: meaningOf(vocab),
      pos: vocab.pos?.trim() || undefined,
      usage: usageOf(vocab),
      example: firstExample(vocab, stemMeaning?.ja)
    }
  })

  const extraExamples = (target?.content?.examples ?? [])
    .filter(e => e.ja && normalize(e.ja) !== normalize(stemMeaning?.ja ?? ''))
    .slice(0, 2)

  return {
    ...explanation,
    whyCorrect: enrichWhyCorrect(explanation.whyCorrect, qtype, target),
    whyWrong,
    coreConcept: enrichCore(explanation.coreConcept, target),
    examples: explanation.examples?.length ? explanation.examples : extraExamples,
    optionNotes,
    stemMeaning: stemMeaning ?? explanation.stemMeaning
  }
}

function indexVocabs(vocabs: VocabBrief[]) {
  const byTerm = new Map<string, VocabBrief>()
  const byReading = new Map<string, VocabBrief[]>()
  for (const v of vocabs) {
    if (v.term && !byTerm.has(v.term)) byTerm.set(v.term, v)
    const reading = (v.reading || '').trim()
    if (reading) {
      const arr = byReading.get(reading) ?? []
      arr.push(v)
      byReading.set(reading, arr)
    }
  }
  return { byTerm, byReading }
}

function lookupOption(
  option: string,
  qtype: string,
  index: ReturnType<typeof indexVocabs>,
  target?: VocabBrief | null
): VocabBrief | undefined {
  if (!option) return undefined
  if (qtype === 'kanji_reading') {
    const list = index.byReading.get(option) ?? []
    return list.find(v => v.term !== target?.term) ?? list[0]
  }
  return index.byTerm.get(option)
}

function meaningOf(v: VocabBrief): string | undefined {
  return displayMeaning(v) || undefined
}

function usageOf(v: VocabBrief): string | undefined {
  const scene = v.content?.usageScene?.trim()
  if (scene) return scene
  const memo = v.content?.memo?.trim()
  if (memo) return memo
  return undefined
}

function firstExample(v: VocabBrief, skipJa?: string): ExampleSentence | undefined {
  const examples = v.content?.examples ?? []
  const skip = skipJa ? normalize(skipJa) : ''
  return examples.find(e => e.ja && (!skip || normalize(e.ja) !== skip)) ?? examples[0]
}

function normalize(s: string) {
  return s.replace(/\s+/g, '')
}

function restoreSentence(stem: string, fill: string) {
  const lines = stem.split('\n').map(s => s.trim()).filter(Boolean)
  const body = lines.length > 1 && /選んでください|最もよい/.test(lines[0]!)
    ? lines.slice(1).join('')
    : lines.join('')
  return body
    .replace(/【[^】]*】/g, fill)
    .replace(/（[　\s]*）/g, fill)
}

function findStemMeaning(stem: string | undefined, target: VocabBrief | null | undefined, fill: string): ExampleSentence | undefined {
  if (!stem || !target || !fill) return undefined
  const restored = restoreSentence(stem, fill)
  if (!restored || restored.length < 4) return undefined
  const n = normalize(restored)
  const examples = (target.content?.examples ?? []).filter(e => e.zh)
  const exact = examples.find(e => normalize(e.ja) === n)
  if (exact) return { ja: exact.ja, zh: exact.zh }
  const loose = examples.find((e) => {
    const ja = normalize(e.ja)
    if (ja.length < 4) return false
    return ja.includes(n) || (n.length >= 6 && n.includes(ja))
  })
  if (loose) return { ja: loose.ja, zh: loose.zh }
  return undefined
}

function enrichWhyCorrect(existing: string, qtype: string, target: VocabBrief | null): string {
  if (!target) return existing
  const meaning = meaningOf(target)
  if (!meaning) return existing
  if (existing.includes(meaning)) return existing
  const term = target.term
  const reading = (target.reading || '').trim()
  if (qtype === 'orthography') {
    return reading
      ? `讀作「${reading}」時，正確寫法是「${term}」，意思是「${meaning}」。`
      : `正確寫法是「${term}」，意思是「${meaning}」。`
  }
  if (qtype === 'kanji_reading') {
    return reading
      ? `【${term}】的正確讀音是「${reading}」，意思是「${meaning}」。`
      : existing
  }
  const label = reading ? `${term}（${reading}）` : term
  return `這個空格要填「${label}」，意思接近「${meaning}」。`
}

function enrichCore(existing: string, target: VocabBrief | null): string {
  if (!target) return existing
  const meaning = meaningOf(target)
  if (!meaning) return existing
  const reading = (target.reading || '').trim()
  return reading && reading !== target.term
    ? `${target.term}（${reading}）＝${meaning}`
    : `${target.term}＝${meaning}`
}

function whyWrongLine(qtype: string, option: string, vocab: VocabBrief | undefined, target: VocabBrief | null): string {
  const targetReading = (target?.reading || '').trim()
  const targetTerm = target?.term || ''
  if (qtype === 'orthography') {
    const reading = vocab?.reading?.trim()
    if (reading && targetReading) return `「${option}」讀作「${reading}」，不是「${targetReading}」這個詞的漢字。`
    if (targetReading) return `「${option}」不是「${targetReading}」這個詞的漢字。`
    return `「${option}」不是正確的漢字寫法。`
  }
  if (qtype === 'kanji_reading') {
    if (vocab && vocab.term !== targetTerm) return `「${option}」是「${vocab.term}」的讀音，不是「${targetTerm}」。`
    if (targetTerm) return `「${option}」不是「${targetTerm}」的讀音。`
    return `「${option}」不是正確讀音。`
  }
  const meaning = vocab ? meaningOf(vocab) : undefined
  if (meaning) return `「${option}」的意思是「${meaning}」，放進這個句子意思或搭配不自然。`
  return `「${option}」放進這個句子，意思或搭配不自然。`
}

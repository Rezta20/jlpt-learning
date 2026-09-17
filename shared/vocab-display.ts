/** Display helpers for vocab cards: Traditional Chinese gloss + POS. */

const CJK = /[\u4e00-\u9fff]/

export function hasZhText(s: string | null | undefined): boolean {
  return !!s?.trim() && CJK.test(s)
}

export function posTags(pos: string | null | undefined): string[] {
  if (!pos?.trim()) return []
  return pos.split(/[／/、,;]+/).map(p => p.trim()).filter(Boolean)
}

export function displayMeaning(kp: {
  meaningZh?: string | null
  content?: { coreMeaning?: string } | null
}): string | null {
  const core = kp.content?.coreMeaning?.trim()
  if (hasZhText(core)) return core!
  const meaning = kp.meaningZh?.trim()
  if (hasZhText(meaning)) return meaning!
  return null
}

/** Seed leftover: OpenJLPT English stuffed into meaning_zh. */
export function englishGloss(kp: { meaningZh?: string | null }): string | null {
  const s = kp.meaningZh?.trim()
  if (!s || hasZhText(s)) return null
  return s
}

export function firstZhExample(examples?: { ja: string, zh: string }[] | null) {
  return examples?.find(e => e.ja && hasZhText(e.zh)) ?? null
}

export function needsVocabEnrichment(kp: {
  meaningZh?: string | null
  pos?: string | null
  content?: { coreMeaning?: string, examples?: { ja: string, zh: string }[] } | null
}): boolean {
  if (!displayMeaning(kp)) return true
  if (!kp.pos?.trim()) return true
  const examples = kp.content?.examples
  if (examples?.length && !firstZhExample(examples) && examples.some(e => e.zh && /[A-Za-z]{3,}/.test(e.zh))) return true
  return false
}

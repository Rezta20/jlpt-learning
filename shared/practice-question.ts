/** Seed vocab stems that should not appear in practice (literary / proverb-like). */

export const AWKWARD_SEED_STEM_RE = 'かような|差し上げ|非礼をお許し|賜り|候|ございま|畏れ|拙者|まことに恐|べし|なり。'

const awkwardRe = new RegExp(AWKWARD_SEED_STEM_RE)

/** Instruction lines used by short 漢字読み／表記 stems. */
function stemBody(stem: string) {
  return stem
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && !/選んでください|最もよい/.test(s))
    .join('')
}

export function isAwkwardSeedStem(stem: string): boolean {
  const body = stemBody(stem) || stem
  if (awkwardRe.test(body) || awkwardRe.test(stem)) return true
  if (/である[。．]?$/.test(body.trim())) return true
  const compact = body.replace(/\s+/g, '')
  if (compact.length > 42) return true
  return false
}

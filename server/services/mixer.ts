import { sql } from 'drizzle-orm'
import { useDb, schema } from '../db'
import type { Level, Skill } from '../../shared/types'
import { AWKWARD_SEED_STEM_RE } from '../../shared/practice-question'
import { estimateLevel, levelAbove } from './level'
import { getPlanWeek } from '../../shared/plan'
import { todayStr, startOfLocalDay, sqlTs } from '../utils/dates'

export type Bucket = 'review' | 'mistake' | 'new' | 'stretch' | 'todayNew' | 'learn'

export interface MixInput {
  userId: string
  count: number
  levels?: Level[]
  skills: Skill[]
  autoLevel: boolean
  mix: boolean
  /** override ratios */
  ratios?: Partial<Record<Bucket, number>>
  /** restrict to knowledge points */
  kpIds?: string[]
  /** exclude these question ids */
  exclude?: string[]
  /** restrict qtypes */
  qtypes?: string[]
}

export interface Picked {
  id: string
  bucket: Bucket
  kpIds: string[]
  passageId?: string | null
}

interface Candidate extends Record<string, unknown> {
  id: string
  kp_ids: string[]
  passage_id: string | null
}

const DEFAULT_RATIOS: Record<Bucket, number> = { review: 0.4, mistake: 0.2, new: 0.3, stretch: 0.1, todayNew: 0, learn: 0 }

function inList(arr: string[]) {
  return sql.join(arr.map(a => sql`${a}`), sql`, `)
}

export async function pickQuestions(input: MixInput): Promise<Picked[]> {
  const db = useDb()
  const now = new Date()
  const nowTs = sqlTs(now)
  const ago3h = sqlTs(new Date(now.getTime() - 3 * 3600_000))
  const ago20h = sqlTs(new Date(now.getTime() - 20 * 3600_000))
  const ago14d = sqlTs(new Date(now.getTime() - 14 * 86400_000))
  const skills = input.skills.length ? input.skills : (['vocab', 'grammar'] as Skill[])
  const week = getPlanWeek(todayStr())

  let levels: Level[] = input.levels ?? []
  let stretchLevel: Level | null = null
  if (input.autoLevel || levels.length === 0) {
    const est = await estimateLevel(input.userId)
    const planLevels = week?.newLevels ?? ['N5', 'N4']
    // Blend plan levels with estimate: never go below plan, add estimate target
    const set = new Set<Level>(planLevels)
    set.add(est.estimate)
    set.add(est.target)
    // Keep at most 3 adjacent levels
    levels = Array.from(set).sort((a, b) => ['N5', 'N4', 'N3', 'N2', 'N1'].indexOf(a) - ['N5', 'N4', 'N3', 'N2', 'N1'].indexOf(b)).slice(0, 3)
    stretchLevel = levelAbove(levels[levels.length - 1]!)
    if (stretchLevel === levels[levels.length - 1]) stretchLevel = null
  } else {
    stretchLevel = null
  }

  const ratios = { ...DEFAULT_RATIOS, ...(input.ratios ?? {}) }
  if (!input.mix) {
    Object.assign(ratios, { review: 0, mistake: 0, new: 1, stretch: 0, todayNew: 0, learn: 0 })
  }
  if (!stretchLevel) {
    ratios.new += ratios.stretch
    ratios.stretch = 0
  }

  const exclude = new Set(input.exclude ?? [])
  const picked: Picked[] = []
  const kpCount = new Map<string, number>()
  const usedPassages = new Set<string>()

  const skillFilter = sql`q.skill in (${inList(skills)})`
  const qtypeFilter = input.qtypes?.length ? sql`and q.qtype in (${inList(input.qtypes)})` : sql``
  const kpFilter = input.kpIds?.length
    ? sql`and exists (select 1 from ${schema.questionKnowledgePoints} kf where kf.question_id = q.id and kf.knowledge_point_id in (${inList(input.kpIds)}))`
    : sql``
  // Skip OpenJLPT-punched context items and literary seed vocab stems; prefer AI items.
  const practiceQuestionFilter = sql`
    and q.source_ref is distinct from 'bank:context'
    and not (
      q.source = 'seed' and q.skill = 'vocab' and (
        q.stem ~ ${AWKWARD_SEED_STEM_RE}
        or (q.source_ref in ('bank:kanji_reading', 'bank:orthography') and char_length(q.stem) > 48)
      )
    )
  `
  const preferAi = sql`(q.source = 'ai') desc`

  const baseSelect = sql`
    select q.id, q.passage_id,
      coalesce(array_agg(qk.knowledge_point_id) filter (where qk.knowledge_point_id is not null), '{}') as kp_ids
  `

  const take = (cands: Candidate[], n: number, bucket: Bucket) => {
    let added = 0
    for (const c of cands) {
      if (added >= n) break
      if (exclude.has(c.id) || picked.some(p => p.id === c.id)) continue
      if (c.passage_id && usedPassages.has(c.passage_id) && bucket !== 'new') continue
      const over = c.kp_ids.some(k => (kpCount.get(k) ?? 0) >= 2)
      if (over && bucket !== 'learn' && bucket !== 'todayNew') continue
      picked.push({ id: c.id, bucket, kpIds: c.kp_ids, passageId: c.passage_id })
      for (const k of c.kp_ids) kpCount.set(k, (kpCount.get(k) ?? 0) + 1)
      if (c.passage_id) usedPassages.add(c.passage_id)
      added++
    }
    return added
  }

  const want = (b: Bucket) => Math.round(input.count * (ratios[b] ?? 0))
  let remaining = input.count

  // ---- learn / todayNew: questions for specific KPs (learn) or KPs learned today ----
  if (ratios.learn > 0 && input.kpIds?.length) {
    const rows = await db.execute<Candidate>(sql`
      ${baseSelect}
      from ${schema.questions} q
      join ${schema.questionKnowledgePoints} qk on qk.question_id = q.id
      left join ${schema.userQuestionState} uq on uq.question_id = q.id and uq.user_id = ${input.userId}
      where q.quality = 'ok' and ${skillFilter} ${qtypeFilter} ${practiceQuestionFilter}
        and qk.knowledge_point_id in (${inList(input.kpIds)})
      group by q.id
      order by ${preferAi}, min(coalesce(uq.seen, 0)) asc, random()
      limit ${input.count * 3}
    `)
    remaining -= take(rows as unknown as Candidate[], Math.min(remaining, want('learn')), 'learn')
  }

  if (ratios.todayNew > 0) {
    const dayStart = startOfLocalDay(todayStr())
    const rows = await db.execute<Candidate>(sql`
      ${baseSelect}
      from ${schema.questions} q
      join ${schema.questionKnowledgePoints} qk on qk.question_id = q.id
      join ${schema.userKnowledgeState} s on s.knowledge_point_id = qk.knowledge_point_id and s.user_id = ${input.userId}
      left join ${schema.userQuestionState} uq on uq.question_id = q.id and uq.user_id = ${input.userId}
      where q.quality = 'ok' and ${skillFilter} ${qtypeFilter} ${practiceQuestionFilter}
        and s.learned_at >= ${sqlTs(dayStart)}
        and (uq.last_seen_at is null or uq.last_seen_at < ${ago3h})
      group by q.id
      order by ${preferAi}, random()
      limit ${input.count * 3}
    `)
    remaining -= take(rows as unknown as Candidate[], Math.min(remaining, want('todayNew')), 'todayNew')
  }

  // ---- review: due knowledge points ----
  if (ratios.review > 0 && remaining > 0) {
    const rows = await db.execute<Candidate>(sql`
      ${baseSelect}
      from ${schema.questions} q
      join ${schema.questionKnowledgePoints} qk on qk.question_id = q.id
      join ${schema.userKnowledgeState} s on s.knowledge_point_id = qk.knowledge_point_id and s.user_id = ${input.userId}
      left join ${schema.userQuestionState} uq on uq.question_id = q.id and uq.user_id = ${input.userId}
      where q.quality = 'ok' and ${skillFilter} ${qtypeFilter} ${kpFilter} ${practiceQuestionFilter}
        and s.due <= ${nowTs} and s.state <> 0
        and (uq.last_seen_at is null or uq.last_seen_at < ${ago20h})
      group by q.id
      order by ${preferAi}, min(s.due) asc, min(coalesce(uq.seen, 0)) asc, random()
      limit ${input.count * 3}
    `)
    remaining -= take(rows as unknown as Candidate[], Math.min(remaining, want('review')), 'review')
  }

  // ---- mistake: retry-due or recently wrong ----
  if (ratios.mistake > 0 && remaining > 0) {
    const rows = await db.execute<Candidate>(sql`
      ${baseSelect}
      from ${schema.questions} q
      join ${schema.userQuestionState} uq on uq.question_id = q.id and uq.user_id = ${input.userId}
      left join ${schema.questionKnowledgePoints} qk on qk.question_id = q.id
      where q.quality = 'ok' and ${skillFilter} ${qtypeFilter} ${kpFilter} ${practiceQuestionFilter}
        and uq.wrong_streak > 0
        and (uq.retry_due is null or uq.retry_due <= ${nowTs})
        and uq.last_wrong_at > ${ago14d}
      group by q.id, uq.retry_due, uq.last_wrong_at
      order by ${preferAi}, uq.retry_due asc nulls first, uq.last_wrong_at asc, random()
      limit ${input.count * 3}
    `)
    remaining -= take(rows as unknown as Candidate[], Math.min(remaining, want('mistake')), 'mistake')
  }

  // ---- new: unseen questions at target levels ----
  const fetchNew = async (lvls: Level[], n: number, bucket: Bucket) => {
    if (n <= 0 || !lvls.length) return 0
    const rows = await db.execute<Candidate>(sql`
      ${baseSelect}
      from ${schema.questions} q
      left join ${schema.questionKnowledgePoints} qk on qk.question_id = q.id
      left join ${schema.userQuestionState} uq on uq.question_id = q.id and uq.user_id = ${input.userId}
      left join ${schema.userKnowledgeState} s on s.knowledge_point_id = qk.knowledge_point_id and s.user_id = ${input.userId}
      where q.quality = 'ok' and ${skillFilter} ${qtypeFilter} ${kpFilter} ${practiceQuestionFilter}
        and q.level in (${inList(lvls)})
        and uq.question_id is null
      group by q.id
      order by ${preferAi}, (count(s.knowledge_point_id) > 0) desc, random()
      limit ${n * 4}
    `)
    return take(rows as unknown as Candidate[], n, bucket)
  }

  if (remaining > 0) {
    // new bucket gets its share plus anything the earlier buckets could not fill
    const newWant = Math.max(want('new'), remaining - want('stretch'))
    remaining -= await fetchNew(levels, Math.min(remaining, newWant), 'new')
  }
  if (remaining > 0 && stretchLevel && ratios.stretch > 0) {
    remaining -= await fetchNew([stretchLevel], remaining, 'stretch')
  }
  // Fallbacks: seen-but-not-recent questions at target levels
  if (remaining > 0) {
    const rows = await db.execute<Candidate>(sql`
      ${baseSelect}
      from ${schema.questions} q
      left join ${schema.questionKnowledgePoints} qk on qk.question_id = q.id
      left join ${schema.userQuestionState} uq on uq.question_id = q.id and uq.user_id = ${input.userId}
      where q.quality = 'ok' and ${skillFilter} ${qtypeFilter} ${kpFilter} ${practiceQuestionFilter}
        and q.level in (${inList(levels)})
        and (uq.last_seen_at is null or uq.last_seen_at < ${ago20h})
      group by q.id
      order by ${preferAi}, min(coalesce(uq.seen, 0)) asc, random()
      limit ${remaining * 3}
    `)
    remaining -= take(rows as unknown as Candidate[], remaining, 'new')
  }
  if (remaining > 0) {
    // Last resort: anything not in this session
    const rows = await db.execute<Candidate>(sql`
      ${baseSelect}
      from ${schema.questions} q
      left join ${schema.questionKnowledgePoints} qk on qk.question_id = q.id
      where q.quality = 'ok' and ${skillFilter} ${qtypeFilter} ${kpFilter} ${practiceQuestionFilter}
      group by q.id
      order by ${preferAi}, random()
      limit ${remaining * 3}
    `)
    take(rows as unknown as Candidate[], remaining, 'new')
  }

  // Shuffle so buckets are interleaved (but keep passage questions grouped)
  return interleave(picked)
}

function interleave(items: Picked[]): Picked[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  // Keep questions of the same passage contiguous (in first-seen order)
  const out: Picked[] = []
  const seenPassage = new Set<string>()
  for (const p of arr) {
    if (p.passageId) {
      if (seenPassage.has(p.passageId)) continue
      seenPassage.add(p.passageId)
      out.push(...arr.filter(x => x.passageId === p.passageId))
    } else {
      out.push(p)
    }
  }
  return out
}

import { sql } from 'drizzle-orm'
import { useDb, schema } from '../db'
import { LEVELS, type Level } from '../../shared/types'

export interface LevelStat {
  level: Level
  attempts: number
  correct: number
  accuracy: number
  avgMs: number
  status: 'stable' | 'progress' | 'below' | 'nodata'
}

export interface LevelEstimate {
  estimate: Level
  target: Level
  perLevel: LevelStat[]
  perSkill: Record<string, { attempts: number, correct: number, accuracy: number }>
}

const WINDOW = 200

/**
 * Estimate the user's JLPT level from recent answers.
 * A level is "stable" when ≥ 100 recent attempts and accuracy ≥ 80%.
 * Estimate = highest stable level (min N5). Target = one above.
 */
export async function estimateLevel(userId: string): Promise<LevelEstimate> {
  const db = useDb()
  const rows = await db.execute<{ level: string, attempts: number, correct: number, avg_ms: number }>(sql`
    with recent as (
      select a.is_correct, a.response_ms, q.level
      from ${schema.answers} a
      join ${schema.questions} q on q.id = a.question_id
      where a.user_id = ${userId}
      order by a.answered_at desc
      limit ${WINDOW * 3}
    ),
    ranked as (
      select *, row_number() over (partition by level) as rn from recent
    )
    select level, count(*)::int as attempts,
           sum(case when is_correct then 1 else 0 end)::int as correct,
           coalesce(avg(response_ms), 0)::int as avg_ms
    from ranked where rn <= ${WINDOW}
    group by level
  `)
  const perLevel: LevelStat[] = LEVELS.map((level) => {
    const r = rows.find(x => x.level === level)
    const attempts = r?.attempts ?? 0
    const correct = r?.correct ?? 0
    const accuracy = attempts ? correct / attempts : 0
    let status: LevelStat['status'] = 'nodata'
    if (attempts >= 30) {
      status = accuracy >= 0.8 && attempts >= 100 ? 'stable' : accuracy >= 0.6 ? 'progress' : 'below'
    }
    return { level, attempts, correct, accuracy, avgMs: r?.avg_ms ?? 0, status }
  })

  let estimate: Level = 'N5'
  for (const s of perLevel) {
    if (s.status === 'stable') estimate = s.level
    else break
  }
  const idx = LEVELS.indexOf(estimate)
  const target = LEVELS[Math.min(idx + 1, LEVELS.length - 1)]!

  const skillRows = await db.execute<{ skill: string, attempts: number, correct: number }>(sql`
    select q.skill, count(*)::int as attempts, sum(case when a.is_correct then 1 else 0 end)::int as correct
    from ${schema.answers} a join ${schema.questions} q on q.id = a.question_id
    where a.user_id = ${userId} and a.answered_at > now() - interval '14 days'
    group by q.skill
  `)
  const perSkill: LevelEstimate['perSkill'] = {}
  for (const r of skillRows) {
    perSkill[r.skill] = { attempts: r.attempts, correct: r.correct, accuracy: r.attempts ? r.correct / r.attempts : 0 }
  }
  return { estimate, target, perLevel, perSkill }
}

export function levelAbove(level: Level): Level {
  const i = LEVELS.indexOf(level)
  return LEVELS[Math.min(i + 1, LEVELS.length - 1)]!
}
export function levelBelow(level: Level): Level {
  const i = LEVELS.indexOf(level)
  return LEVELS[Math.max(i - 1, 0)]!
}

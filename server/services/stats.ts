import { and, eq, desc, sql, gte } from 'drizzle-orm'
import { useDb, schema } from '../db'
import { todayStr, addDays } from '../utils/dates'
import { estimateLevel } from './level'
import { CHECKPOINTS, EXAM_DATE, daysBetween } from '../../shared/plan'

export async function weakestKpIds(userId: string, n: number) {
  const db = useDb()
  const rows = await db.select({ id: schema.userKnowledgeState.knowledgePointId })
    .from(schema.userKnowledgeState)
    .where(and(eq(schema.userKnowledgeState.userId, userId), gte(schema.userKnowledgeState.attempts, 2)))
    .orderBy(schema.userKnowledgeState.mastery, desc(schema.userKnowledgeState.lapses))
    .limit(n)
  return rows.map(r => r.id)
}

export async function dashboard(userId: string) {
  const db = useDb()
  const today = todayStr()
  const [level, daily, stats] = await Promise.all([
    estimateLevel(userId),
    db.query.dailyProgress.findMany({
      where: and(eq(schema.dailyProgress.userId, userId), gte(schema.dailyProgress.date, addDays(today, -60))),
      orderBy: schema.dailyProgress.date
    }),
    db.query.userStats.findFirst({ where: eq(schema.userStats.userId, userId) })
  ])

  const totals = await db.execute<{ answered: number, correct: number, sessions: number }>(sql`
    select count(*)::int as answered, sum(case when is_correct then 1 else 0 end)::int as correct,
           count(distinct session_id)::int as sessions
    from ${schema.answers} where user_id = ${userId}
  `)

  // Mastery heatmap: level × type buckets
  const heat = await db.execute<{ level: string, type: string, total: number, learned: number, strong: number, weak: number, avg: number }>(sql`
    select kp.level, kp.type,
      count(kp.id)::int as total,
      count(s.knowledge_point_id) filter (where s.state <> 0)::int as learned,
      count(s.knowledge_point_id) filter (where s.mastery >= 70)::int as strong,
      count(s.knowledge_point_id) filter (where s.attempts >= 2 and s.mastery < 40)::int as weak,
      coalesce(avg(s.mastery) filter (where s.state <> 0), 0)::int as avg
    from ${schema.knowledgePoints} kp
    left join ${schema.userKnowledgeState} s on s.knowledge_point_id = kp.id and s.user_id = ${userId}
    group by kp.level, kp.type
    order by kp.level, kp.type
  `)

  const weak = await db.execute<{ id: string, term: string, reading: string | null, type: string, level: string, mastery: number, attempts: number, correct: number, lapses: number }>(sql`
    select kp.id, kp.term, kp.reading, kp.type, kp.level, s.mastery, s.attempts, s.correct, s.lapses
    from ${schema.userKnowledgeState} s join ${schema.knowledgePoints} kp on kp.id = s.knowledge_point_id
    where s.user_id = ${userId} and s.attempts >= 2
    order by s.mastery asc, s.lapses desc limit 20
  `)

  const dueForecast = await db.execute<{ day: string, cnt: number }>(sql`
    select to_char((s.due at time zone 'Asia/Taipei')::date, 'YYYY-MM-DD') as day, count(*)::int as cnt
    from ${schema.userKnowledgeState} s
    where s.user_id = ${userId} and s.state <> 0 and s.due < ${new Date(Date.now() + 8 * 86400_000).toISOString()}
    group by 1 order by 1
  `)

  const snapshots = await db.query.levelSnapshots.findMany({
    where: eq(schema.levelSnapshots.userId, userId),
    orderBy: schema.levelSnapshots.date
  })

  const mocks = await db.query.sessions.findMany({
    where: and(eq(schema.sessions.userId, userId), eq(schema.sessions.mode, 'mock')),
    orderBy: desc(schema.sessions.startedAt),
    limit: 10
  })

  const qtypeStats = await db.execute<{ qtype: string, skill: string, attempts: number, correct: number, avg_ms: number }>(sql`
    select q.qtype, q.skill, count(*)::int as attempts, sum(case when a.is_correct then 1 else 0 end)::int as correct, avg(a.response_ms)::int as avg_ms
    from ${schema.answers} a join ${schema.questions} q on q.id = a.question_id
    where a.user_id = ${userId} and a.answered_at > now() - interval '30 days'
    group by q.qtype, q.skill order by q.skill, q.qtype
  `)

  const checkpoints = await evaluateCheckpoints(userId, level)

  return {
    today,
    daysToExam: daysBetween(today, EXAM_DATE),
    level,
    totals: totals[0] ?? { answered: 0, correct: 0, sessions: 0 },
    stats: stats ?? { xp: 0, streak: 0, longestStreak: 0, levelEstimate: 'N5' },
    daily,
    heat,
    weak,
    dueForecast,
    snapshots: snapshots.map(s => ({ date: s.date, ...(s.data as Record<string, unknown>) })),
    mocks: mocks.map(m => ({ id: m.id, startedAt: m.startedAt, finishedAt: m.finishedAt, total: m.total, correct: m.correct, config: m.config })),
    qtypeStats,
    checkpoints
  }
}

export async function evaluateCheckpoints(userId: string, level: Awaited<ReturnType<typeof estimateLevel>>) {
  const db = useDb()
  const today = todayStr()
  const out: { date: string, label: string, detail: string, target: number, value: number | null, ok: boolean | null, upcoming: boolean }[] = []
  for (const c of CHECKPOINTS) {
    let value: number | null = null
    if (c.metric === 'n4_grammar_acc') {
      const r = await db.execute<{ attempts: number, correct: number }>(sql`
        select count(*)::int as attempts, sum(case when a.is_correct then 1 else 0 end)::int as correct
        from ${schema.answers} a join ${schema.questions} q on q.id = a.question_id
        where a.user_id = ${userId} and q.level = 'N4' and q.skill = 'grammar' and a.answered_at > now() - interval '14 days'
      `)
      const row = r[0]
      value = row && row.attempts >= 30 ? row.correct / row.attempts : null
    } else if (c.metric === 'n3_lang_mock' || c.metric === 'full_mock') {
      const wanted = c.metric === 'n3_lang_mock' ? ['language', 'full'] : ['full']
      const mocks = await db.query.sessions.findMany({
        where: and(eq(schema.sessions.userId, userId), eq(schema.sessions.mode, 'mock')),
        orderBy: desc(schema.sessions.startedAt),
        limit: 20
      })
      const m = mocks.find(x => wanted.includes(String((x.config as Record<string, unknown>).section)) && x.finishedAt)
      if (m) {
        const { scoreMock } = await import('./mock')
        const sc = await scoreMock(userId, m.id)
        value = c.metric === 'n3_lang_mock' ? (sc.scaled.language ?? null) : sc.estimateTotal
      }
    }
    const ok = value == null ? null : value >= c.target
    out.push({ date: c.date, label: c.label, detail: c.detail, target: c.target, value, ok, upcoming: c.date >= today })
  }
  void level
  return out
}

/** Store today's level snapshot (called by cron or lazily). */
export async function snapshotLevel(userId: string) {
  const db = useDb()
  const today = todayStr()
  const est = await estimateLevel(userId)
  const data = {
    estimate: est.estimate,
    target: est.target,
    perLevel: Object.fromEntries(est.perLevel.map(l => [l.level, { acc: Math.round(l.accuracy * 100), n: l.attempts }])),
    perSkill: est.perSkill
  }
  await db.insert(schema.levelSnapshots).values({ userId, date: today, data })
    .onConflictDoUpdate({ target: [schema.levelSnapshots.userId, schema.levelSnapshots.date], set: { data } })
  await db.update(schema.userStats).set({ levelEstimate: est.estimate }).where(eq(schema.userStats.userId, userId))
  return data
}

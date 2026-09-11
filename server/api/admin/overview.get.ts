import { sql } from 'drizzle-orm'
import { useDb, schema } from '../../db'
import { monthUsage } from '../../services/ai/client'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const db = useDb()
  const cfg = useRuntimeConfig()
  const usage = await monthUsage()
  const usageByKind = await db.execute<{ kind: string, calls: number, cost: string }>(sql`
    select kind, count(*)::int as calls, coalesce(sum(cost_usd), 0)::text as cost from ${schema.aiUsage}
    where created_at >= date_trunc('month', now() at time zone 'Asia/Taipei') group by kind order by 3 desc
  `)
  const qCounts = await db.execute<{ level: string, skill: string, qtype: string, n: number }>(sql`
    select level, skill, qtype, count(*)::int as n from ${schema.questions} where quality = 'ok' group by level, skill, qtype order by level, skill, qtype
  `)
  const kpCounts = await db.execute<{ level: string, type: string, n: number, ready: number, with_q: number }>(sql`
    select kp.level, kp.type, count(*)::int as n,
      count(*) filter (where kp.content_ready)::int as ready,
      count(*) filter (where exists (select 1 from ${schema.questionKnowledgePoints} qk where qk.knowledge_point_id = kp.id))::int as with_q
    from ${schema.knowledgePoints} kp group by kp.level, kp.type order by kp.level, kp.type
  `)
  const passages = await db.execute<{ level: string, n: number, scheduled: number }>(sql`
    select level, count(*)::int as n, count(*) filter (where scheduled_for is not null and scheduled_for >= current_date)::int as scheduled
    from ${schema.passages} group by level order by level
  `)
  const flagged = await db.execute<{ id: string, stem: string, qtype: string, level: string, quality: string, flags_count: number, times_answered: number, times_correct: number }>(sql`
    select id, stem, qtype, level, quality, flags_count, times_answered, times_correct from ${schema.questions}
    where quality <> 'ok' or (times_answered >= 5 and times_correct::float / times_answered < 0.2)
    order by flags_count desc, times_answered desc limit 50
  `)
  return {
    budgetUsd: Number(cfg.monthlyBudgetUsd || 3),
    model: cfg.openaiModel,
    hasOpenAiKey: !!(cfg.openaiApiKey || process.env.OPENAI_API_KEY),
    usage,
    usageByKind: usageByKind.map(u => ({ ...u, cost: Number(u.cost) })),
    qCounts,
    kpCounts,
    passages,
    flagged
  }
})

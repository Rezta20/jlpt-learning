import { sql } from 'drizzle-orm'
import { useDb, schema } from '../db'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const db = useDb()
  const q = getQuery(event)
  const limit = Math.min(200, Math.max(10, Number(q.limit ?? 100)))
  const rows = await db.execute<{
    id: string, stem: string, qtype: string, skill: string, level: string, options: string[], answer_index: number,
    seen: number, correct: number, wrong_streak: number, last_wrong_at: string, retry_due: string | null,
    kps: { id: string, term: string, type: string }[]
  }>(sql`
    select q.id, q.stem, q.qtype, q.skill, q.level, q.options, q.answer_index,
      uq.seen, uq.correct, uq.wrong_streak, uq.last_wrong_at, uq.retry_due,
      coalesce(json_agg(json_build_object('id', kp.id, 'term', kp.term, 'type', kp.type)) filter (where kp.id is not null), '[]') as kps
    from ${schema.userQuestionState} uq
    join ${schema.questions} q on q.id = uq.question_id
    left join ${schema.questionKnowledgePoints} qk on qk.question_id = q.id
    left join ${schema.knowledgePoints} kp on kp.id = qk.knowledge_point_id
    where uq.user_id = ${userId} and uq.last_wrong_at is not null
      and (uq.wrong_streak > 0 or uq.last_wrong_at > now() - interval '7 days')
    group by q.id, uq.seen, uq.correct, uq.wrong_streak, uq.last_wrong_at, uq.retry_due
    order by uq.wrong_streak desc, uq.last_wrong_at desc
    limit ${limit}
  `)
  return { items: rows }
})

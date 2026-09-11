import { z } from 'zod'
import { and, eq, ilike, or, sql, desc, asc } from 'drizzle-orm'
import { useDb, schema } from '../../db'
import { toKpDto } from '../../services/today'

const querySchema = z.object({
  type: z.enum(['vocab', 'grammar']).optional(),
  level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).optional(),
  q: z.string().max(50).optional(),
  filter: z.enum(['all', 'learned', 'unlearned', 'weak', 'due']).default('all'),
  sort: z.enum(['default', 'mastery', 'due', 'recent']).default('default'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50)
})

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const q = await getValidatedQuery(event, querySchema.parse)
  const db = useDb()
  const conds = []
  if (q.type) conds.push(eq(schema.knowledgePoints.type, q.type))
  if (q.level) conds.push(eq(schema.knowledgePoints.level, q.level))
  if (q.q) {
    const like = `%${q.q}%`
    conds.push(or(ilike(schema.knowledgePoints.term, like), ilike(schema.knowledgePoints.reading, like), ilike(schema.knowledgePoints.meaningZh, like)))
  }
  if (q.filter === 'learned') conds.push(sql`${schema.userKnowledgeState.learnedAt} is not null`)
  if (q.filter === 'unlearned') conds.push(sql`${schema.userKnowledgeState.learnedAt} is null`)
  if (q.filter === 'weak') conds.push(sql`${schema.userKnowledgeState.attempts} >= 2 and ${schema.userKnowledgeState.mastery} < 40`)
  if (q.filter === 'due') conds.push(sql`${schema.userKnowledgeState.state} <> 0 and ${schema.userKnowledgeState.due} <= now()`)

  const order = q.sort === 'mastery'
    ? [asc(sql`coalesce(${schema.userKnowledgeState.mastery}, -1)`)]
    : q.sort === 'due'
      ? [asc(sql`${schema.userKnowledgeState.due} nulls last`)]
      : q.sort === 'recent'
        ? [desc(sql`${schema.userKnowledgeState.lastSeenAt} nulls last`)]
        : [asc(schema.knowledgePoints.level), asc(schema.knowledgePoints.priority), asc(schema.knowledgePoints.createdAt)]

  const where = conds.length ? and(...conds) : undefined
  const rows = await db.select({ kp: schema.knowledgePoints, s: schema.userKnowledgeState, qn: sql<number>`(select count(*)::int from ${schema.questionKnowledgePoints} qk where qk.knowledge_point_id = ${schema.knowledgePoints.id})` })
    .from(schema.knowledgePoints)
    .leftJoin(schema.userKnowledgeState, and(eq(schema.userKnowledgeState.knowledgePointId, schema.knowledgePoints.id), eq(schema.userKnowledgeState.userId, userId)))
    .where(where)
    .orderBy(...order)
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize)
  const total = await db.select({ n: sql<number>`count(*)::int` })
    .from(schema.knowledgePoints)
    .leftJoin(schema.userKnowledgeState, and(eq(schema.userKnowledgeState.knowledgePointId, schema.knowledgePoints.id), eq(schema.userKnowledgeState.userId, userId)))
    .where(where)
  return {
    items: rows.map(r => ({ ...toKpDto(r.kp, r.s), questionCount: r.qn })),
    total: total[0]?.n ?? 0,
    page: q.page,
    pageSize: q.pageSize
  }
})

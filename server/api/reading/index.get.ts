import { desc, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const db = useDb()
  const rows = await db.select({
    id: schema.passages.id,
    level: schema.passages.level,
    title: schema.passages.title,
    scheduledFor: schema.passages.scheduledFor,
    source: schema.passages.source,
    createdAt: schema.passages.createdAt,
    readAt: schema.passageReads.readAt,
    correct: schema.passageReads.correct,
    total: schema.passageReads.total,
    unknownCount: sql<number>`coalesce(jsonb_array_length(${schema.passageReads.unknownTokens}), 0)`
  })
    .from(schema.passages)
    .leftJoin(schema.passageReads, sql`${schema.passageReads.passageId} = ${schema.passages.id} and ${schema.passageReads.userId} = ${userId}`)
    .orderBy(desc(schema.passages.createdAt))
    .limit(100)
  void eq
  return { items: rows }
})

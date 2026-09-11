import { desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../db'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const db = useDb()
  const items = await db.query.imports.findMany({ where: eq(schema.imports.userId, userId), orderBy: desc(schema.imports.createdAt), limit: 50 })
  return { items: items.map(i => ({ id: i.id, title: i.title, status: i.status, passageId: i.passageId, createdAt: i.createdAt, preview: i.rawText.slice(0, 60) })) }
})

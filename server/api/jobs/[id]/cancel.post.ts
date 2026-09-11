import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const [row] = await db.update(schema.generationJobs).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(schema.generationJobs.id, id)).returning()
  if (!row) throw createError({ statusCode: 404 })
  return row
})

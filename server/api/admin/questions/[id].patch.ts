import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db'

const bodySchema = z.object({
  quality: z.enum(['ok', 'flagged', 'disabled']).optional(),
  stem: z.string().min(1).max(2000).optional(),
  options: z.array(z.string()).length(4).optional(),
  answerIndex: z.number().int().min(0).max(3).optional()
})

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const [row] = await db.update(schema.questions).set(body).where(eq(schema.questions.id, id)).returning()
  if (!row) throw createError({ statusCode: 404 })
  return row
})

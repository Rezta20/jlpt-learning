import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../db'

const bodySchema = z.object({
  reason: z.string().max(300).optional(),
  disable: z.boolean().default(false)
})

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const [row] = await db.update(schema.questions).set({
    flagsCount: sql`${schema.questions.flagsCount} + 1`,
    quality: body.disable ? 'disabled' : 'flagged'
  }).where(eq(schema.questions.id, id)).returning({ id: schema.questions.id, quality: schema.questions.quality })
  if (!row) throw createError({ statusCode: 404 })
  return row
})

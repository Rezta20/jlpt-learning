import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db'

const bodySchema = z.object({
  meaningZh: z.string().max(500).optional(),
  reading: z.string().max(100).optional(),
  videoUrl: z.string().url().max(500).nullable().optional(),
  bookRefs: z.array(z.object({ book: z.string(), lesson: z.union([z.number(), z.string()]).optional(), page: z.string().optional(), note: z.string().optional() })).optional(),
  content: z.object({
    coreMeaning: z.string().optional(),
    connection: z.string().optional(),
    usageScene: z.string().optional(),
    nuance: z.string().optional(),
    examples: z.array(z.object({ ja: z.string(), zh: z.string() })).optional(),
    confusables: z.array(z.object({ term: z.string(), diff: z.string() })).optional(),
    memo: z.string().optional()
  }).optional(),
  priority: z.number().int().optional()
})

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const [row] = await db.update(schema.knowledgePoints).set({ ...body, updatedAt: new Date() }).where(eq(schema.knowledgePoints.id, id)).returning()
  if (!row) throw createError({ statusCode: 404 })
  return row
})

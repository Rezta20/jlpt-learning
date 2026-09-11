import { z } from 'zod'
import { useDb, schema } from '../../db'
import { parseImportedText } from '../../services/ai/generate'
import { eq } from 'drizzle-orm'

const bodySchema = z.object({
  text: z.string().min(10).max(4000),
  title: z.string().max(100).optional(),
  withQuestions: z.boolean().default(true)
})

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const [imp] = await db.insert(schema.imports).values({ userId, kind: 'text', rawText: body.text, title: body.title ?? null }).returning()
  try {
    const res = await parseImportedText(imp!.id, body.text, body.withQuestions)
    return { id: imp!.id, passageId: res.passageId, questions: res.questions, level: res.level }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.update(schema.imports).set({ status: 'failed', error: msg.slice(0, 500) }).where(eq(schema.imports.id, imp!.id))
    throw e
  }
})

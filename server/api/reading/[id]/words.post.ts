import { z } from 'zod'
import { addWordFromPassage } from '../../../services/reading'

const bodySchema = z.object({
  surface: z.string().min(1).max(50),
  reading: z.string().max(50).optional(),
  meaning: z.string().max(200).optional()
})

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, bodySchema.parse)
  const kp = await addWordFromPassage(userId, id, body.surface, body.reading, body.meaning)
  return { id: kp.id, term: kp.term }
})

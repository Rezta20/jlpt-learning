import { z } from 'zod'
import { answerQuestion } from '../../../services/session'

const bodySchema = z.object({
  questionId: z.string().uuid(),
  chosenIndex: z.number().int().min(0).max(7),
  responseMs: z.number().int().min(0).default(0)
})

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, bodySchema.parse)
  return answerQuestion(userId, id, body.questionId, body.chosenIndex, body.responseMs)
})

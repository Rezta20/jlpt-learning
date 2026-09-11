import { z } from 'zod'
import { finishPassage } from '../../../services/reading'

const bodySchema = z.object({
  unknownTokens: z.array(z.string().max(50)).max(200).default([])
})

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, bodySchema.parse)
  return finishPassage(userId, id, body.unknownTokens)
})

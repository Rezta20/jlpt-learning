import { explainAgain } from '../../../services/ai/generate'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const content = await explainAgain(id)
  return { explanation: content }
})

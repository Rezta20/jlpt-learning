import { loadPassage } from '../../services/reading'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  return loadPassage(userId, id)
})

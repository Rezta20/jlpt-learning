import { loadSession } from '../../services/session'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  return loadSession(userId, id)
})

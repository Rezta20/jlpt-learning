import { buildToday } from '../services/today'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  return buildToday(userId)
})

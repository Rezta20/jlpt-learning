import { todayGrammar } from '../../services/today'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const q = getQuery(event)
  const limit = q.limit ? Math.min(10, Math.max(1, Number(q.limit))) : undefined
  return { items: await todayGrammar(userId, limit) }
})

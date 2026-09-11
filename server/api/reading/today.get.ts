import { pickTodayPassage, loadPassage } from '../../services/reading'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const p = await pickTodayPassage(userId)
  if (!p) return { passage: null }
  return { passage: await loadPassage(userId, p.id) }
})

import { dashboard } from '../../services/stats'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  return dashboard(userId)
})

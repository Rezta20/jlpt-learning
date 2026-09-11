import { PLAN_WEEKS, CHECKPOINTS, EXAM_DATE } from '../../shared/plan'
import { todayStr } from '../utils/dates'
import { estimateLevel } from '../services/level'
import { evaluateCheckpoints } from '../services/stats'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const level = await estimateLevel(userId)
  const checkpoints = await evaluateCheckpoints(userId, level)
  return { today: todayStr(), examDate: EXAM_DATE, weeks: PLAN_WEEKS, checkpoints, rawCheckpoints: CHECKPOINTS, level }
})

import { stepJob } from '../../../services/jobs'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  return stepJob(id)
})

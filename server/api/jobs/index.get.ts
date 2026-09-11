import { listJobs } from '../../services/jobs'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return { items: await listJobs() }
})

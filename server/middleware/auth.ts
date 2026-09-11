/**
 * Protect every /api route except auth, cron and health endpoints.
 */
export default defineEventHandler(async (event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/')) return
  if (path.startsWith('/api/auth/') || path.startsWith('/api/cron/') || path === '/api/health' || path.startsWith('/api/_')) return
  await requireUserSession(event)
})

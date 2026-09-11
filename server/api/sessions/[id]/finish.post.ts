import { finishSession } from '../../../services/session'
import { markBlockDone } from '../../../services/gamification'
import { scoreMock } from '../../../services/mock'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const res = await finishSession(userId, id)
  let blockXp = 0
  const block = (res.session.config as Record<string, unknown>).block as 'morning' | 'evening' | null
  if (res.session.mode === 'daily' && block && res.session.answered >= Math.min(10, res.session.total)) {
    const r = await markBlockDone(userId, block)
    blockXp = r.xp
  }
  let mock: Awaited<ReturnType<typeof scoreMock>> | null = null
  if (res.session.mode === 'mock') {
    mock = await scoreMock(userId, id)
  }
  return {
    xp: res.xp + blockXp,
    total: res.session.total,
    answered: res.session.answered,
    correct: res.session.correct,
    durationMs: res.session.durationMs,
    mock
  }
})

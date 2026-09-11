import { and, eq, desc } from 'drizzle-orm'
import { useDb, schema } from '../../db'
import { toKpDto } from '../../services/today'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const kp = await db.query.knowledgePoints.findFirst({ where: eq(schema.knowledgePoints.id, id) })
  if (!kp) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const state = await db.query.userKnowledgeState.findFirst({
    where: and(eq(schema.userKnowledgeState.userId, userId), eq(schema.userKnowledgeState.knowledgePointId, id))
  })
  const qs = await db.select({ q: schema.questions })
    .from(schema.questionKnowledgePoints)
    .innerJoin(schema.questions, eq(schema.questions.id, schema.questionKnowledgePoints.questionId))
    .where(eq(schema.questionKnowledgePoints.knowledgePointId, id))
    .limit(50)
  const history = await db.select({ a: schema.answers, qtype: schema.questions.qtype })
    .from(schema.answers)
    .innerJoin(schema.questions, eq(schema.questions.id, schema.answers.questionId))
    .innerJoin(schema.questionKnowledgePoints, eq(schema.questionKnowledgePoints.questionId, schema.questions.id))
    .where(and(eq(schema.answers.userId, userId), eq(schema.questionKnowledgePoints.knowledgePointId, id)))
    .orderBy(desc(schema.answers.answeredAt))
    .limit(30)
  return {
    ...toKpDto(kp, state),
    questions: qs.map(r => ({ id: r.q.id, qtype: r.q.qtype, stem: r.q.stem, level: r.q.level, skill: r.q.skill, quality: r.q.quality, timesAnswered: r.q.timesAnswered, timesCorrect: r.q.timesCorrect })),
    history: history.map(h => ({ at: h.a.answeredAt, isCorrect: h.a.isCorrect, responseMs: h.a.responseMs, qtype: h.qtype }))
  }
})

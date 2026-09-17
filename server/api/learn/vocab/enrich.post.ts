import { z } from 'zod'
import { inArray } from 'drizzle-orm'
import { useDb, schema } from '../../../db'
import { generateVocabContent, kpsById } from '../../../services/ai/generate'
import { toKpDto } from '../../../services/today'
import { needsVocabEnrichment } from '../../../../shared/vocab-display'

const BATCH = 8

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const cfg = useRuntimeConfig()
  if (!(cfg.openaiApiKey || process.env.OPENAI_API_KEY)) {
    throw createError({ statusCode: 400, statusMessage: '尚未設定 OpenAI 金鑰，無法補中文' })
  }
  const body = await readValidatedBody(event, z.object({
    kpIds: z.array(z.string().uuid()).min(1).max(60)
  }).parse)

  const all = await kpsById(body.kpIds)
  const need = all.filter(k => k.type === 'vocab' && needsVocabEnrichment(k))
  const batch = need.slice(0, BATCH)
  let updated = 0
  if (batch.length) {
    const res = await generateVocabContent(batch)
    updated = res.updated
  }

  const db = useDb()
  const rows = await db.query.knowledgePoints.findMany({
    where: inArray(schema.knowledgePoints.id, body.kpIds)
  })
  const byId = new Map(rows.map(r => [r.id, r]))
  const items = body.kpIds.map(id => byId.get(id)).filter(Boolean).map(r => toKpDto(r!))
  const pendingIds = items.filter(i => i.type === 'vocab' && needsVocabEnrichment(i)).map(i => i.id)
  return { updated, pendingIds, items }
})

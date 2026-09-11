import { z } from 'zod'
import { createJob } from '../../services/jobs'

const levelEnum = z.enum(['N5', 'N4', 'N3', 'N2', 'N1'])
const bodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('questions'),
    type: z.enum(['vocab', 'grammar']),
    level: levelEnum,
    target: z.number().int().min(5).max(2000),
    qtypes: z.array(z.string()).optional(),
    perKp: z.number().int().min(1).max(8).optional(),
    minQuestions: z.number().int().min(1).max(30).optional(),
    kpIds: z.array(z.string().uuid()).optional(),
    model: z.string().optional()
  }),
  z.object({
    kind: z.literal('grammar_content'),
    level: levelEnum,
    target: z.number().int().min(1).max(1000).default(200),
    kpIds: z.array(z.string().uuid()).optional(),
    model: z.string().optional()
  }),
  z.object({
    kind: z.literal('vocab_content'),
    level: levelEnum,
    target: z.number().int().min(1).max(5000).default(1000),
    kpIds: z.array(z.string().uuid()).optional(),
    model: z.string().optional()
  }),
  z.object({
    kind: z.literal('passages'),
    level: levelEnum.optional(),
    count: z.number().int().min(1).max(30).default(7),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    model: z.string().optional()
  })
])

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  if (body.kind === 'passages') {
    const { kind, count, ...params } = body
    return createJob(kind, params, count)
  }
  const { kind, target, ...params } = body
  return createJob(kind, params, target)
})

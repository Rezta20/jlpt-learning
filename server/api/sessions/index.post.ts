import { z } from 'zod'
import { createSession } from '../../services/session'
import { getPlanWeek } from '../../../shared/plan'
import { todayStr, localHour } from '../../utils/dates'
import type { Skill } from '../../../shared/types'

const levelEnum = z.enum(['N5', 'N4', 'N3', 'N2', 'N1'])
const skillEnum = z.enum(['vocab', 'grammar', 'reading', 'listening'])

const bodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('quick'),
    levels: z.array(levelEnum).default([]),
    skills: z.array(skillEnum).min(1),
    count: z.number().int().min(5).max(100),
    autoLevel: z.boolean().default(true),
    mix: z.boolean().default(true),
    qtypes: z.array(z.string()).optional()
  }),
  z.object({
    mode: z.literal('daily'),
    block: z.enum(['morning', 'evening']).optional(),
    count: z.number().int().min(5).max(100).optional()
  }),
  z.object({
    mode: z.literal('learn'),
    kpIds: z.array(z.string().uuid()).min(1).max(40),
    count: z.number().int().min(3).max(60).default(10),
    skills: z.array(skillEnum).optional()
  }),
  z.object({
    mode: z.literal('mistakes'),
    count: z.number().int().min(5).max(100).default(20)
  }),
  z.object({
    mode: z.literal('weak'),
    count: z.number().int().min(5).max(100).default(20)
  }),
  z.object({
    mode: z.literal('baseline')
  }),
  z.object({
    mode: z.literal('mock'),
    section: z.enum(['language', 'reading', 'listening', 'full']),
    level: levelEnum.default('N3')
  })
])

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  switch (body.mode) {
    case 'quick': {
      const s = await createSession({
        userId,
        mode: 'quick',
        count: body.count,
        levels: body.autoLevel ? undefined : body.levels,
        skills: body.skills,
        autoLevel: body.autoLevel || body.levels.length === 0,
        mix: body.mix,
        qtypes: body.qtypes
      })
      return { id: s.id }
    }
    case 'daily': {
      const week = getPlanWeek(todayStr())
      const block = body.block ?? (localHour() < 14 ? 'morning' : 'evening')
      const weights = week?.skillsWeight ?? { vocab: 0.5, grammar: 0.5 }
      const skills = (Object.keys(weights) as Skill[]).filter(k => (weights[k] ?? 0) > 0 && k !== 'reading')
      const count = body.count ?? (block === 'morning' ? 20 : 30)
      const ratios = block === 'morning'
        ? { review: 0.6, mistake: 0.25, new: 0.15, stretch: 0, todayNew: 0 }
        : { todayNew: 0.4, review: 0.3, mistake: 0.15, new: 0.1, stretch: 0.05 }
      const s = await createSession({ userId, mode: 'daily', count, skills, autoLevel: true, mix: true, ratios, block })
      return { id: s.id }
    }
    case 'learn': {
      const s = await createSession({
        userId,
        mode: 'learn',
        count: body.count,
        skills: body.skills ?? ['vocab', 'grammar'],
        autoLevel: true,
        mix: true,
        kpIds: body.kpIds,
        ratios: { learn: 1, review: 0, mistake: 0, new: 0, stretch: 0, todayNew: 0 }
      })
      return { id: s.id }
    }
    case 'mistakes': {
      const s = await createSession({
        userId,
        mode: 'mistakes',
        count: body.count,
        skills: ['vocab', 'grammar', 'reading', 'listening'],
        autoLevel: true,
        mix: true,
        ratios: { mistake: 1, review: 0, new: 0, stretch: 0, todayNew: 0 }
      })
      return { id: s.id }
    }
    case 'weak': {
      const { weakestKpIds } = await import('../../services/stats')
      const kpIds = await weakestKpIds(userId, 12)
      if (!kpIds.length) throw createError({ statusCode: 409, statusMessage: '還沒有足夠的答題紀錄可以判斷弱點。' })
      const s = await createSession({
        userId,
        mode: 'weak',
        count: body.count,
        skills: ['vocab', 'grammar'],
        autoLevel: true,
        mix: true,
        kpIds,
        ratios: { learn: 1, review: 0, mistake: 0, new: 0, stretch: 0, todayNew: 0 }
      })
      return { id: s.id }
    }
    case 'baseline': {
      const s = await createSession({
        userId,
        mode: 'baseline',
        count: 40,
        levels: ['N5', 'N4'],
        skills: ['vocab', 'grammar'],
        autoLevel: false,
        mix: false,
        timeLimitSec: 30 * 60
      })
      return { id: s.id }
    }
    case 'mock': {
      const { buildMock } = await import('../../services/mock')
      const s = await buildMock(userId, body.section, body.level)
      return { id: s.id }
    }
  }
})

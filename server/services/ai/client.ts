import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { ZodType } from 'zod'
import { sql } from 'drizzle-orm'
import { useDb, schema } from '../../db'

let _client: OpenAI | null = null

export function openai() {
  if (_client) return _client
  const key = useRuntimeConfig().openaiApiKey || process.env.OPENAI_API_KEY
  if (!key) throw createError({ statusCode: 500, statusMessage: 'NUXT_OPENAI_API_KEY 尚未設定' })
  _client = new OpenAI({ apiKey: key, maxRetries: 2, timeout: 120_000 })
  return _client
}

/** USD per 1M tokens. Approximate; used only for the in-app cost estimate. */
const PRICES: Record<string, { in: number, out: number }> = {
  'gpt-5.4': { in: 2.5, out: 15 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'gpt-5.4-nano': { in: 0.2, out: 1.2 },
  'gpt-5.5': { in: 5, out: 20 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1': { in: 2, out: 8 }
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const key = Object.keys(PRICES).find(k => model.startsWith(k)) ?? 'gpt-5.4-mini'
  const p = PRICES[key]!
  return (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out
}

export async function monthUsage() {
  const db = useDb()
  const rows = await db.execute<{ cost: string, input: number, output: number, calls: number }>(sql`
    select coalesce(sum(cost_usd), 0)::text as cost, coalesce(sum(input_tokens), 0)::int as input,
           coalesce(sum(output_tokens), 0)::int as output, count(*)::int as calls
    from ${schema.aiUsage}
    where created_at >= date_trunc('month', now() at time zone 'Asia/Taipei')
  `)
  const r = rows[0]
  return { costUsd: Number(r?.cost ?? 0), inputTokens: r?.input ?? 0, outputTokens: r?.output ?? 0, calls: r?.calls ?? 0 }
}

export async function assertBudget() {
  const budget = Number(useRuntimeConfig().monthlyBudgetUsd || 5)
  const u = await monthUsage()
  if (u.costUsd >= budget) {
    throw createError({ statusCode: 402, statusMessage: `本月 AI 預算 US$${budget} 已用完（已用 US$${u.costUsd.toFixed(2)}）。可在環境變數 NUXT_MONTHLY_BUDGET_USD 調整。` })
  }
}

export interface CallOptions {
  kind: string
  refId?: string
  model?: string
  temperature?: number
  maxOutputTokens?: number
  /** 'low' | 'medium' | 'high' — reasoning effort for reasoning models */
  reasoning?: 'minimal' | 'low' | 'medium' | 'high'
}

/**
 * Call the model with a strict JSON schema and record usage.
 */
export async function callStructured<T>(schemaZod: ZodType<T>, system: string, user: string, opts: CallOptions): Promise<T> {
  await assertBudget()
  const cfg = useRuntimeConfig()
  const model = opts.model || cfg.openaiModel || 'gpt-5.4-mini'
  const client = openai()
  const res = await client.responses.parse({
    model,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    text: { format: zodTextFormat(schemaZod as never, 'result') },
    max_output_tokens: opts.maxOutputTokens ?? 8000,
    ...(opts.reasoning ? { reasoning: { effort: opts.reasoning } } : {})
  })
  const usage = res.usage
  const inTok = usage?.input_tokens ?? 0
  const outTok = usage?.output_tokens ?? 0
  const cost = estimateCost(model, inTok, outTok)
  try {
    await useDb().insert(schema.aiUsage).values({
      kind: opts.kind,
      model,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: cost.toFixed(5),
      refId: opts.refId ?? null
    })
  } catch (e) {
    console.error('[ai] failed to record usage', e)
  }
  const parsed = res.output_parsed as T | null
  if (!parsed) {
    throw createError({ statusCode: 502, statusMessage: `AI 回傳無法解析（${res.status ?? 'unknown'}）` })
  }
  return parsed
}

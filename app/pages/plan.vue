<script setup lang="ts">
import type { PlanWeek } from '~~/shared/plan'

useHead({ title: '學習路線' })
const { data } = await useFetch<{
  today: string
  examDate: string
  weeks: PlanWeek[]
  checkpoints: { date: string, label: string, detail: string, target: number, value: number | null, ok: boolean | null, upcoming: boolean }[]
  level: { estimate: string, target: string }
}>('/api/plan')

const isCurrent = (w: PlanWeek) => data.value && w.startDate <= data.value.today && data.value.today <= w.endDate
const isPast = (w: PlanWeek) => data.value && w.endDate < data.value.today

function fmtValue(c: { value: number | null, target: number }) {
  if (c.value == null) return '尚無資料'
  return c.target <= 1 ? `${Math.round(c.value * 100)}%` : String(c.value)
}
function fmtTarget(c: { target: number }) {
  return c.target <= 1 ? `${Math.round(c.target * 100)}%` : String(c.target)
}
</script>

<template>
  <div
    v-if="data"
    class="space-y-5"
  >
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">12 週學習路線</h1>
      <p class="mt-1 text-sm text-muted">
        考試 {{ data.examDate }} · 目前估計程度 {{ data.level.estimate }} → 練習目標 {{ data.level.target }}
      </p>
    </div>

    <UCard>
      <template #header>
        <div class="font-medium">檢查點</div>
      </template>
      <ul class="space-y-3">
        <li
          v-for="c in data.checkpoints"
          :key="c.date"
          class="flex items-start gap-3"
        >
          <span
            class="mt-1 inline-block size-2.5 shrink-0 rounded-full"
            :class="c.ok === true ? 'bg-success' : c.ok === false ? 'bg-error' : 'bg-elevated'"
          />
          <div class="flex-1">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="font-medium">{{ c.date }} · {{ c.label }}</span>
              <span class="text-sm tabular-nums text-muted">目前 {{ fmtValue(c) }} / 目標 {{ fmtTarget(c) }}</span>
            </div>
            <p class="text-sm text-muted">{{ c.detail }}</p>
          </div>
        </li>
      </ul>
    </UCard>

    <ol class="relative space-y-3 border-l border-default pl-5">
      <li
        v-for="w in data.weeks"
        :key="w.index"
        class="relative"
      >
        <span
          class="absolute -left-[26px] top-1.5 inline-block size-3 rounded-full border-2 border-default bg-default"
          :class="isCurrent(w) ? 'border-primary bg-primary' : isPast(w) ? 'bg-elevated' : ''"
        />
        <UCard
          :ui="{ body: 'p-4' }"
          :class="isCurrent(w) ? 'ring-primary/60' : isPast(w) ? 'opacity-70' : ''"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div class="font-medium">{{ w.title }}</div>
            <div class="text-xs text-muted">{{ w.startDate.slice(5) }} – {{ w.endDate.slice(5) }}</div>
          </div>
          <ul class="mt-2 list-disc space-y-0.5 pl-5 text-sm">
            <li
              v-for="f in w.focus"
              :key="f"
            >
              {{ f }}
            </li>
          </ul>
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>文法 {{ w.grammarPerDay }}/天</span>
            <span>單字 {{ w.vocabPerDay }}/天</span>
            <span>閱讀 {{ w.readingLevel }}</span>
            <span v-if="w.listeningMinutes">聽力 {{ w.listeningMinutes }} 分/天</span>
            <span v-if="w.book">{{ w.book.name }} {{ w.book.lessons[0] }}–{{ w.book.lessons[1] }} 課</span>
          </div>
        </UCard>
      </li>
    </ol>
  </div>
</template>

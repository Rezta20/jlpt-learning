<script setup lang="ts">
import { qtypeLabel, SKILL_LABEL } from '~~/shared/types'

useHead({ title: '儀表板' })
const toastError = useToastError()
const { data, pending } = await useFetch<any>('/api/stats/dashboard')

const last28 = computed(() => {
  const days: { date: string, answered: number, correct: number, xp: number }[] = []
  const map = new Map<string, any>((data.value?.daily ?? []).map((d: any) => [d.date, d]))
  const today = new Date(data.value?.today ?? Date.now())
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const row = map.get(key)
    days.push({ date: key, answered: row?.answered ?? 0, correct: row?.correct ?? 0, xp: row?.xp ?? 0 })
  }
  return days
})
const maxAnswered = computed(() => Math.max(10, ...last28.value.map(d => d.answered)))

const starting = ref(false)
async function drillWeak() {
  starting.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/sessions', { method: 'POST', body: { mode: 'weak', count: 20 } })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = false
  }
}
const totalAcc = computed(() => (data.value?.totals?.answered ? Math.round(data.value.totals.correct / data.value.totals.answered * 100) : 0))
</script>

<template>
  <div
    v-if="data"
    class="space-y-5"
  >
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">儀表板</h1>
      <div class="text-sm text-muted">距考試 {{ data.daysToExam }} 天</div>
    </div>

    <!-- KPIs -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <UCard :ui="{ body: 'p-4' }">
        <div class="text-xs text-muted">估計程度</div>
        <div class="text-2xl font-semibold">{{ data.level.estimate }} <span class="text-sm font-normal text-muted">→ {{ data.level.target }}</span></div>
      </UCard>
      <UCard :ui="{ body: 'p-4' }">
        <div class="text-xs text-muted">總答題</div>
        <div class="text-2xl font-semibold tabular-nums">{{ data.totals.answered }} <span class="text-sm font-normal text-muted">{{ totalAcc }}%</span></div>
      </UCard>
      <UCard :ui="{ body: 'p-4' }">
        <div class="text-xs text-muted">連續天數</div>
        <div class="text-2xl font-semibold tabular-nums">{{ data.stats.streak }} <span class="text-sm font-normal text-muted">最長 {{ data.stats.longestStreak }}</span></div>
      </UCard>
      <UCard :ui="{ body: 'p-4' }">
        <div class="text-xs text-muted">XP</div>
        <div class="text-2xl font-semibold tabular-nums">{{ data.stats.xp }}</div>
      </UCard>
    </div>

    <!-- Level accuracy -->
    <UCard>
      <template #header>
        <div class="font-medium">各等級正確率（最近 200 題）</div>
      </template>
      <div class="space-y-3">
        <div
          v-for="l in data.level.perLevel"
          :key="l.level"
          class="flex items-center gap-3 text-sm"
        >
          <span class="w-8 font-medium">{{ l.level }}</span>
          <div class="h-2.5 flex-1 overflow-hidden rounded bg-elevated">
            <div
              class="h-full rounded"
              :class="l.stable ? 'bg-success' : 'bg-primary'"
              :style="{ width: `${Math.round(l.accuracy * 100)}%` }"
            />
          </div>
          <span class="w-28 text-right tabular-nums text-muted">{{ Math.round(l.accuracy * 100) }}% · {{ l.attempts }} 題</span>
        </div>
        <p class="text-xs text-muted">綠色＝已穩定（≥100 題且 ≥80%）。程度＝最高的穩定等級；練習目標＝再上一級。</p>
      </div>
      <div
        v-if="data.level.perSkill"
        class="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"
      >
        <div
          v-for="(v, k) in data.level.perSkill"
          :key="k"
          class="rounded bg-elevated/60 p-2"
        >
          <div class="text-xs text-muted">{{ SKILL_LABEL[k as keyof typeof SKILL_LABEL] ?? k }}</div>
          <div class="tabular-nums">{{ v.attempts ? Math.round(v.accuracy * 100) : '–' }}% <span class="text-xs text-muted">{{ v.attempts }} 題</span></div>
        </div>
      </div>
    </UCard>

    <!-- Activity -->
    <UCard>
      <template #header>
        <div class="font-medium">最近 28 天答題</div>
      </template>
      <div class="flex h-28 items-end gap-1">
        <div
          v-for="d in last28"
          :key="d.date"
          class="group relative flex-1"
          :title="`${d.date}：${d.answered} 題，正確 ${d.correct}`"
        >
          <div
            class="w-full rounded-t bg-elevated"
            :style="{ height: `${Math.max(2, d.answered / maxAnswered * 100)}%` }"
          >
            <div
              class="w-full rounded-t bg-primary"
              :style="{ height: `${d.answered ? d.correct / d.answered * 100 : 0}%` }"
            />
          </div>
        </div>
      </div>
      <div class="mt-1 flex justify-between text-xs text-muted">
        <span>{{ last28[0]?.date.slice(5) }}</span>
        <span>今天</span>
      </div>
    </UCard>

    <div class="grid gap-4 md:grid-cols-2">
      <!-- Mastery heat -->
      <UCard>
        <template #header>
          <div class="font-medium">知識點掌握</div>
        </template>
        <table class="w-full text-sm">
          <thead class="text-xs text-muted">
            <tr>
              <th class="pb-1 text-left font-normal">範圍</th>
              <th class="pb-1 text-right font-normal">已學/總數</th>
              <th class="pb-1 text-right font-normal">穩固</th>
              <th class="pb-1 text-right font-normal">弱</th>
              <th class="pb-1 text-right font-normal">平均</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="h in data.heat"
              :key="h.level + h.type"
              class="border-t border-default"
            >
              <td class="py-1.5">{{ h.level }} {{ h.type === 'vocab' ? '單字' : '文法' }}</td>
              <td class="py-1.5 text-right tabular-nums">{{ h.learned }}/{{ h.total }}</td>
              <td class="py-1.5 text-right tabular-nums text-success">{{ h.strong }}</td>
              <td class="py-1.5 text-right tabular-nums text-error">{{ h.weak }}</td>
              <td class="py-1.5 text-right tabular-nums">{{ h.learned ? h.avg + '%' : '–' }}</td>
            </tr>
          </tbody>
        </table>
      </UCard>

      <!-- Due forecast -->
      <UCard>
        <template #header>
          <div class="font-medium">未來 7 天到期複習</div>
        </template>
        <ul class="space-y-1.5 text-sm">
          <li
            v-for="d in data.dueForecast"
            :key="d.day"
            class="flex items-center gap-3"
          >
            <span class="w-14 text-muted">{{ d.day <= data.today ? '逾期/今天' : d.day.slice(5) }}</span>
            <div class="h-2 flex-1 overflow-hidden rounded bg-elevated">
              <div
                class="h-full bg-primary"
                :style="{ width: `${Math.min(100, d.cnt / Math.max(1, ...data.dueForecast.map((x: any) => x.cnt)) * 100)}%` }"
              />
            </div>
            <span class="w-10 text-right tabular-nums">{{ d.cnt }}</span>
          </li>
        </ul>
        <p
          v-if="!data.dueForecast.length"
          class="text-sm text-muted"
        >
          目前沒有排程中的複習。
        </p>
      </UCard>
    </div>

    <!-- Weak points -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="font-medium">最弱的知識點</div>
          <UButton
            size="xs"
            label="加強練習 20 題"
            icon="i-lucide-target"
            :loading="starting"
            :disabled="!data.weak.length"
            @click="drillWeak"
          />
        </div>
      </template>
      <ul class="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <li
          v-for="w in data.weak"
          :key="w.id"
          class="flex items-center justify-between gap-2"
        >
          <NuxtLink
            :to="`/knowledge/${w.id}`"
            class="ja truncate hover:underline"
          >
            {{ w.term }}
            <span class="text-xs text-muted">{{ w.level }}</span>
          </NuxtLink>
          <span class="shrink-0 tabular-nums text-muted">{{ w.mastery }}% · {{ w.correct }}/{{ w.attempts }}</span>
        </li>
      </ul>
      <p
        v-if="!data.weak.length"
        class="text-sm text-muted"
      >
        答題資料還不夠。
      </p>
    </UCard>

    <!-- Qtype stats -->
    <UCard>
      <template #header>
        <div class="font-medium">題型正確率（30 天）</div>
      </template>
      <ul class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <li
          v-for="q in data.qtypeStats"
          :key="q.qtype"
          class="flex items-center gap-3"
        >
          <span class="w-28 truncate">{{ qtypeLabel(q.qtype) }}</span>
          <div class="h-2 flex-1 overflow-hidden rounded bg-elevated">
            <div
              class="h-full"
              :class="q.correct / q.attempts >= 0.8 ? 'bg-success' : q.correct / q.attempts >= 0.6 ? 'bg-warning' : 'bg-error'"
              :style="{ width: `${Math.round(q.correct / q.attempts * 100)}%` }"
            />
          </div>
          <span class="w-24 text-right tabular-nums text-muted">{{ Math.round(q.correct / q.attempts * 100) }}% · {{ q.attempts }}</span>
        </li>
      </ul>
      <p
        v-if="!data.qtypeStats.length"
        class="text-sm text-muted"
      >
        還沒有作答紀錄。
      </p>
    </UCard>

    <!-- Checkpoints + mocks -->
    <div class="grid gap-4 md:grid-cols-2">
      <UCard>
        <template #header>
          <div class="font-medium">檢查點</div>
        </template>
        <ul class="space-y-2 text-sm">
          <li
            v-for="c in data.checkpoints"
            :key="c.date"
            class="flex items-center gap-2"
          >
            <span
              class="inline-block size-2.5 rounded-full"
              :class="c.ok === true ? 'bg-success' : c.ok === false ? 'bg-error' : 'bg-elevated'"
            />
            <span class="flex-1">{{ c.date }} {{ c.label }}</span>
            <span class="tabular-nums text-muted">{{ c.value == null ? '–' : (c.target <= 1 ? Math.round(c.value * 100) + '%' : c.value) }} / {{ c.target <= 1 ? Math.round(c.target * 100) + '%' : c.target }}</span>
          </li>
        </ul>
      </UCard>
      <UCard>
        <template #header>
          <div class="font-medium">模考紀錄</div>
        </template>
        <ul class="space-y-1.5 text-sm">
          <li
            v-for="m in data.mocks"
            :key="m.id"
            class="flex items-center justify-between"
          >
            <NuxtLink
              :to="`/practice/${m.id}`"
              class="hover:underline"
            >
              {{ fmtDate(m.startedAt) }} · {{ m.config?.level }} {{ m.config?.section === 'full' ? '完整' : m.config?.section === 'language' ? '言語知識' : m.config?.section === 'reading' ? '読解' : '聴解' }}
            </NuxtLink>
            <span class="tabular-nums text-muted">{{ m.correct }}/{{ m.total }}{{ m.finishedAt ? '' : '（未完成）' }}</span>
          </li>
        </ul>
        <p
          v-if="!data.mocks.length"
          class="text-sm text-muted"
        >
          還沒做過模考。
        </p>
      </UCard>
    </div>
  </div>
  <div
    v-else-if="pending"
    class="space-y-3"
  >
    <USkeleton class="h-20 w-full" />
    <USkeleton class="h-40 w-full" />
  </div>
</template>

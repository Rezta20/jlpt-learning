<script setup lang="ts">
import type { TodayDto } from '~~/shared/types'

useHead({ title: '今日' })
const toastError = useToastError()
const { data, refresh, pending } = await useFetch<TodayDto>('/api/today')

const starting = ref<string | null>(null)

async function startDaily(block: 'morning' | 'evening') {
  starting.value = block
  try {
    const res = await $fetch<{ id: string }>('/api/sessions', { method: 'POST', body: { mode: 'daily', block } })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = null
  }
}

async function startMode(mode: 'mistakes' | 'baseline') {
  starting.value = mode
  try {
    const res = await $fetch<{ id: string }>('/api/sessions', { method: 'POST', body: { mode } })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = null
  }
}

const goalPct = computed(() => {
  const p = data.value?.progress
  if (!p) return 0
  const steps = [p.morningDone, p.eveningDone, p.readingDone].filter(Boolean).length
  return Math.round((steps / 3) * 100)
})

onMounted(() => {
  // refresh when returning to the tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh()
  })
})
</script>

<template>
  <div
    v-if="data"
    class="space-y-5"
  >
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm text-muted">
          {{ data.date }}
          <span v-if="data.week"> · {{ data.week.title }}</span>
        </p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">
          距離 N3 還有 {{ data.daysToExam }} 天
        </h1>
      </div>
      <div class="flex items-center gap-4 text-sm">
        <div class="text-right">
          <div class="text-muted">連續</div>
          <div class="text-lg font-semibold tabular-nums">{{ data.stats.streak }} 天</div>
        </div>
        <div class="text-right">
          <div class="text-muted">XP</div>
          <div class="text-lg font-semibold tabular-nums">{{ data.stats.xp }}</div>
        </div>
        <div class="text-right">
          <div class="text-muted">稱號</div>
          <div class="text-lg font-semibold">{{ data.stats.title }}</div>
        </div>
      </div>
    </div>

    <!-- Today progress -->
    <UCard>
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="text-sm text-muted">今日完成度</div>
          <div class="mt-0.5 text-sm">
            答題 <b class="tabular-nums">{{ data.progress.answered }}</b> 題 ·
            正確率 <b class="tabular-nums">{{ data.progress.answered ? Math.round(data.progress.correct / data.progress.answered * 100) : 0 }}%</b> ·
            +{{ data.progress.xp }} XP
          </div>
        </div>
        <div class="w-40">
          <UProgress
            :model-value="goalPct"
            size="lg"
          />
        </div>
      </div>
    </UCard>

    <!-- Blocks -->
    <div class="grid gap-4 md:grid-cols-2">
      <!-- Morning -->
      <UCard :class="data.progress.morningDone ? 'opacity-80' : ''">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 font-medium">
              <UIcon
                name="i-lucide-sunrise"
                class="size-5 text-primary"
              />
              早上 · 輸入（約 60 分）
            </div>
            <UBadge
              v-if="data.progress.morningDone"
              color="success"
              variant="soft"
              label="完成"
            />
          </div>
        </template>
        <ol class="space-y-3 text-sm">
          <li class="flex items-start gap-3">
            <span class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated text-xs">1</span>
            <div class="flex-1">
              <div class="flex items-center justify-between gap-2">
                <span>到期複習</span>
                <span class="text-muted tabular-nums">單字 {{ data.due.vocab }} · 文法 {{ data.due.grammar }}<span v-if="data.due.overdue"> · 逾期 {{ data.due.overdue }}</span></span>
              </div>
              <UButton
                class="mt-2"
                size="sm"
                variant="soft"
                label="開始複習 20 題"
                icon="i-lucide-rotate-ccw"
                :loading="starting === 'morning'"
                @click="startDaily('morning')"
              />
            </div>
          </li>
          <li class="flex items-start gap-3">
            <span class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated text-xs">2</span>
            <div class="flex-1">
              <div class="flex items-center justify-between gap-2">
                <span>今日文法 {{ data.todayGrammar.length }} 個</span>
                <span class="text-muted tabular-nums">{{ data.progress.grammarLearned }} 已學</span>
              </div>
              <div
                v-if="data.todayGrammar.length"
                class="mt-1 flex flex-wrap gap-1.5"
              >
                <UBadge
                  v-for="g in data.todayGrammar"
                  :key="g.id"
                  variant="outline"
                  color="neutral"
                  class="ja"
                  :label="g.term"
                />
              </div>
              <UButton
                class="mt-2"
                size="sm"
                variant="soft"
                label="學文法 + 各 10 題"
                icon="i-lucide-graduation-cap"
                to="/learn/grammar"
              />
            </div>
          </li>
          <li class="flex items-start gap-3">
            <span class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated text-xs">3</span>
            <div class="flex-1">
              <div class="flex items-center justify-between gap-2">
                <span>今日新單字 {{ data.todayVocabCount }} 個</span>
                <span class="text-muted tabular-nums">{{ data.progress.newWordsLearned }} 已學</span>
              </div>
              <UButton
                class="mt-2"
                size="sm"
                variant="soft"
                label="看單字 + 句中練習"
                icon="i-lucide-spell-check"
                to="/learn/vocab"
              />
            </div>
          </li>
          <li class="flex items-start gap-3">
            <span class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated text-xs">4</span>
            <div class="flex-1">
              <div class="flex items-center justify-between gap-2">
                <span>昨日錯題重做</span>
                <span class="text-muted tabular-nums">{{ data.due.retry }} 題待重做</span>
              </div>
              <UButton
                class="mt-2"
                size="sm"
                variant="soft"
                color="neutral"
                label="重做錯題"
                icon="i-lucide-undo-2"
                :disabled="!data.due.retry"
                :loading="starting === 'mistakes'"
                @click="startMode('mistakes')"
              />
            </div>
          </li>
        </ol>
      </UCard>

      <!-- Evening -->
      <UCard :class="data.progress.eveningDone ? 'opacity-80' : ''">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 font-medium">
              <UIcon
                name="i-lucide-moon"
                class="size-5 text-primary"
              />
              晚上 · 輸出（約 60 分）
            </div>
            <UBadge
              v-if="data.progress.eveningDone"
              color="success"
              variant="soft"
              label="完成"
            />
          </div>
        </template>
        <ol class="space-y-3 text-sm">
          <li class="flex items-start gap-3">
            <span class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated text-xs">1</span>
            <div class="flex-1">
              <div>混合練習 30 題</div>
              <p class="text-muted">今天學的佔 40%，其餘是複習與舊知識</p>
              <UButton
                class="mt-2"
                size="sm"
                label="開始 30 題"
                icon="i-lucide-play"
                :loading="starting === 'evening'"
                @click="startDaily('evening')"
              />
            </div>
          </li>
          <li class="flex items-start gap-3">
            <span class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated text-xs">2</span>
            <div class="flex-1">
              <div class="flex items-center justify-between gap-2">
                <span>每日閱讀一篇</span>
                <UBadge
                  v-if="data.progress.readingDone"
                  color="success"
                  variant="soft"
                  label="完成"
                />
              </div>
              <p class="text-muted">點不會的字就能查、加入單字</p>
              <UButton
                class="mt-2"
                size="sm"
                variant="soft"
                label="開始閱讀"
                icon="i-lucide-newspaper"
                to="/reading"
                :disabled="!data.readingAvailable && !data.progress.readingDone"
              />
              <p
                v-if="!data.readingAvailable && !data.progress.readingDone"
                class="mt-1 text-xs text-muted"
              >
                今天還沒有文章，請到後台生成。
              </p>
            </div>
          </li>
          <li class="flex items-start gap-3">
            <span class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated text-xs">3</span>
            <div class="flex-1">
              <div>看錯題解釋</div>
              <p class="text-muted">不懂就按「我還是不懂」</p>
              <UButton
                class="mt-2"
                size="sm"
                variant="soft"
                color="neutral"
                label="錯題本"
                icon="i-lucide-list-x"
                to="/mistakes"
              />
            </div>
          </li>
        </ol>
      </UCard>
    </div>

    <!-- Week focus + checkpoint -->
    <div class="grid gap-4 md:grid-cols-2">
      <UCard v-if="data.week">
        <template #header>
          <div class="font-medium">本週重點</div>
        </template>
        <ul class="list-disc space-y-1 pl-5 text-sm">
          <li
            v-for="f in data.week.focus"
            :key="f"
          >
            {{ f }}
          </li>
        </ul>
        <UButton
          class="mt-3"
          size="xs"
          variant="link"
          label="看完整路線"
          to="/plan"
          trailing-icon="i-lucide-arrow-right"
        />
      </UCard>
      <UCard v-if="data.checkpoint">
        <template #header>
          <div class="font-medium">下一個檢查點 · {{ data.checkpoint.date }}</div>
        </template>
        <p class="text-sm">{{ data.checkpoint.detail }}</p>
        <div class="mt-3 flex gap-2">
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            label="基準測驗 40 題"
            :loading="starting === 'baseline'"
            @click="startMode('baseline')"
          />
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            label="模考"
            to="/mock"
          />
        </div>
      </UCard>
    </div>
  </div>
  <div
    v-else-if="pending"
    class="space-y-4"
  >
    <USkeleton class="h-8 w-64" />
    <USkeleton class="h-24 w-full" />
    <USkeleton class="h-64 w-full" />
  </div>
</template>

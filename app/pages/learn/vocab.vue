<script setup lang="ts">
import type { KnowledgePointDto } from '~~/shared/types'
import { displayMeaning, englishGloss, firstZhExample, needsVocabEnrichment, posTags } from '~~/shared/vocab-display'

definePageMeta({ layout: 'focus' })
useHead({ title: '今日單字' })
const toastError = useToastError()

const { data, pending, refresh } = await useFetch<{ items: KnowledgePointDto[] }>('/api/learn/vocab')
const items = computed(() => data.value?.items ?? [])
const idx = ref(0)
const current = computed(() => items.value[idx.value])
const starting = ref(false)
const mode = ref<'cards' | 'list'>('cards')
const enriching = ref(false)
const enrichDone = ref(false)

const currentMeaning = computed(() => current.value ? displayMeaning(current.value) : null)
const currentEnglish = computed(() => current.value ? englishGloss(current.value) : null)
const currentPos = computed(() => current.value ? posTags(current.value.pos) : [])
const currentExample = computed(() => current.value ? firstZhExample(current.value.content?.examples) : null)
const missingCount = computed(() => items.value.filter(needsVocabEnrichment).length)

function mergeItems(next: KnowledgePointDto[]) {
  if (!data.value) return
  const map = new Map(next.map(i => [i.id, i]))
  data.value = { items: data.value.items.map(i => map.get(i.id) ?? i) }
}

async function enrichMissing() {
  if (enriching.value || enrichDone.value) return
  const ids = items.value.filter(needsVocabEnrichment).map(i => i.id)
  if (!ids.length) {
    enrichDone.value = true
    return
  }
  enriching.value = true
  try {
    let pendingIds = ids
    for (let i = 0; i < 8 && pendingIds.length; i++) {
      const res = await $fetch<{ updated: number, pendingIds: string[], items: KnowledgePointDto[] }>('/api/learn/vocab/enrich', {
        method: 'POST',
        body: { kpIds: pendingIds }
      })
      if (res.items?.length) mergeItems(res.items)
      if (!res.updated) break
      pendingIds = res.pendingIds
    }
  } catch (e) {
    toastError(e, '無法補中文註解')
  } finally {
    enriching.value = false
    enrichDone.value = true
    if (missingCount.value) await refresh()
  }
}

function next() {
  if (idx.value < items.value.length - 1) idx.value++
  else mode.value = 'list'
}

async function startDrill() {
  starting.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/learn/start', {
      method: 'POST',
      body: { kpIds: items.value.map(i => i.id), kind: 'vocab', count: Math.min(30, Math.max(10, items.value.length)) }
    })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = false
  }
}

onMounted(() => {
  enrichMissing()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
function onKey(e: KeyboardEvent) {
  if (mode.value !== 'cards') return
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
    e.preventDefault()
    next()
  } else if (e.key === 'ArrowLeft' && idx.value > 0) idx.value--
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-3">
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="sm"
        to="/"
      />
      <div class="flex-1 text-sm text-muted">今日新單字 · {{ items.length }} 個</div>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :label="mode === 'cards' ? '清單' : '卡片'"
        @click="mode = mode === 'cards' ? 'list' : 'cards'"
      />
    </div>

    <div
      v-if="pending"
      class="space-y-3"
    >
      <USkeleton class="h-56 w-full" />
    </div>

    <UCard v-else-if="!items.length">
      <p>目前沒有可學的新單字：這個等級的單字還沒有題目。請到後台生成「單字題目」。</p>
      <UButton
        class="mt-3"
        to="/admin"
        variant="soft"
        label="到後台"
      />
    </UCard>

    <template v-else-if="mode === 'cards' && current">
      <p class="mb-3 text-xs text-muted">先快速看過一輪（不用背），接著直接在句子裡練。點卡片看下一張。</p>
      <p
        v-if="enriching"
        class="mb-3 text-xs text-muted"
      >
        正在補中文意思與詞性… 還有 {{ missingCount }} 個
      </p>
      <button
        class="block w-full rounded-xl border border-default bg-default p-8 text-left transition hover:border-primary/50"
        @click="next"
      >
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-xs text-muted">{{ idx + 1 }} / {{ items.length }}</span>
          <div class="flex flex-wrap items-center justify-end gap-1.5">
            <UBadge
              v-for="tag in currentPos"
              :key="tag"
              variant="soft"
              color="neutral"
              :label="tag"
            />
            <UBadge
              variant="outline"
              color="neutral"
              :label="current.level"
            />
          </div>
        </div>
        <div class="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="ja text-4xl font-semibold">{{ current.term }}</span>
          <span
            v-if="current.reading && current.reading !== current.term"
            class="ja text-xl text-muted"
          >{{ current.reading }}</span>
        </div>
        <div class="mt-4 min-h-16">
          <div
            v-if="currentMeaning"
            class="text-xl"
          >
            {{ currentMeaning }}
          </div>
          <div
            v-else-if="enriching"
            class="text-muted"
          >
            正在補中文…
          </div>
          <div
            v-else
            class="text-muted"
          >
            尚無中文
          </div>
          <div
            v-if="currentEnglish && !currentMeaning"
            class="mt-1 text-sm text-muted"
          >
            英文：{{ currentEnglish }}
          </div>
          <div
            v-if="currentExample"
            class="mt-3"
          >
            <div class="ja">{{ currentExample.ja }}</div>
            <div class="text-sm text-muted">{{ currentExample.zh }}</div>
          </div>
          <div
            v-if="current.content?.memo && currentMeaning"
            class="mt-2 text-sm text-muted"
          >
            {{ current.content.memo }}
          </div>
        </div>
      </button>
      <div class="mt-4 flex items-center justify-between">
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-left"
          :disabled="idx === 0"
          @click="idx--"
        />
        <UButton
          variant="soft"
          color="neutral"
          label="跳過看完，直接練"
          @click="mode = 'list'"
        />
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-right"
          @click="next"
        />
      </div>
    </template>

    <template v-else>
      <p
        v-if="enriching"
        class="mb-3 text-xs text-muted"
      >
        正在補中文意思與詞性… 還有 {{ missingCount }} 個
      </p>
      <UCard>
        <ul class="divide-y divide-default">
          <li
            v-for="w in items"
            :key="w.id"
            class="flex items-baseline justify-between gap-3 py-2"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="ja text-lg font-medium">{{ w.term }}</span>
                <span
                  v-if="w.reading && w.reading !== w.term"
                  class="ja text-sm text-muted"
                >{{ w.reading }}</span>
                <span
                  v-for="tag in posTags(w.pos)"
                  :key="tag"
                  class="text-xs text-muted"
                >{{ tag }}</span>
              </div>
            </div>
            <span class="shrink-0 text-right text-sm">{{ displayMeaning(w) || englishGloss(w) || '尚無中文' }}</span>
          </li>
        </ul>
      </UCard>
      <div class="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-4 flex justify-end md:bottom-3">
        <UButton
          size="lg"
          label="開始句中練習"
          icon="i-lucide-pencil-line"
          :loading="starting"
          @click="startDrill"
        />
      </div>
    </template>
  </div>
</template>

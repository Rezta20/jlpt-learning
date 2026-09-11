<script setup lang="ts">
import type { KnowledgePointDto } from '~~/shared/types'

definePageMeta({ layout: 'focus' })
useHead({ title: '今日單字' })
const toastError = useToastError()

const { data, pending } = await useFetch<{ items: KnowledgePointDto[] }>('/api/learn/vocab')
const items = computed(() => data.value?.items ?? [])
const idx = ref(0)
const current = computed(() => items.value[idx.value])
const revealed = ref(false)
const seen = reactive(new Set<string>())
const starting = ref(false)
const mode = ref<'cards' | 'list'>('cards')

watch(idx, () => { revealed.value = false })
function reveal() {
  revealed.value = true
  if (current.value) seen.add(current.value.id)
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
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
function onKey(e: KeyboardEvent) {
  if (mode.value !== 'cards') return
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    revealed.value ? next() : reveal()
  } else if (e.key === 'ArrowLeft' && idx.value > 0) idx.value--
  else if (e.key === 'ArrowRight') next()
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

    <!-- cards mode: quick pre-exposure, then drill in sentences -->
    <template v-else-if="mode === 'cards' && current">
      <p class="mb-3 text-xs text-muted">先快速看過一輪（不用背），接著直接在句子裡練。點卡片翻面。</p>
      <button
        class="block w-full rounded-xl border border-default bg-default p-8 text-left transition hover:border-primary/50"
        @click="revealed ? next() : reveal()"
      >
        <div class="flex items-baseline justify-between">
          <span class="text-xs text-muted">{{ idx + 1 }} / {{ items.length }}</span>
          <UBadge
            variant="outline"
            color="neutral"
            :label="current.level"
          />
        </div>
        <div class="mt-6 flex items-baseline gap-3">
          <span class="ja text-4xl font-semibold">{{ current.term }}</span>
          <span
            v-if="revealed && current.reading && current.reading !== current.term"
            class="ja text-xl text-muted"
          >{{ current.reading }}</span>
        </div>
        <div class="mt-4 min-h-16">
          <template v-if="revealed">
            <div class="text-xl">{{ current.meaningZh }}</div>
            <div
              v-if="current.pos"
              class="mt-1 text-xs text-muted"
            >{{ current.pos }}</div>
            <div
              v-if="current.content?.examples?.[0]"
              class="mt-3"
            >
              <div class="ja">{{ current.content.examples[0].ja }}</div>
              <div class="text-sm text-muted">{{ current.content.examples[0].zh }}</div>
            </div>
            <div
              v-if="current.content?.memo"
              class="mt-2 text-sm text-muted"
            >{{ current.content.memo }}</div>
          </template>
          <span
            v-else
            class="text-muted"
          >點一下看意思</span>
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
      <UCard>
        <ul class="divide-y divide-default">
          <li
            v-for="w in items"
            :key="w.id"
            class="flex items-baseline justify-between gap-3 py-2"
          >
            <div>
              <span class="ja text-lg font-medium">{{ w.term }}</span>
              <span
                v-if="w.reading && w.reading !== w.term"
                class="ja ml-2 text-sm text-muted"
              >{{ w.reading }}</span>
            </div>
            <span class="text-right text-sm">{{ w.meaningZh }}</span>
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

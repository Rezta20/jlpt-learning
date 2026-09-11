<script setup lang="ts">
import type { KnowledgePointDto } from '~~/shared/types'

definePageMeta({ layout: 'focus' })
useHead({ title: '今日文法' })
const toastError = useToastError()

const { data, pending } = await useFetch<{ items: KnowledgePointDto[] }>('/api/learn/grammar')
const items = computed(() => data.value?.items ?? [])
const step = ref(0)
const current = computed(() => items.value[step.value])
const starting = ref(false)

async function drill(kp: KnowledgePointDto) {
  starting.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/learn/start', { method: 'POST', body: { kpIds: [kp.id], kind: 'grammar', count: 10 } })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = false
  }
}

async function drillAll() {
  starting.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/learn/start', { method: 'POST', body: { kpIds: items.value.map(i => i.id), kind: 'grammar', count: Math.min(30, items.value.length * 8) } })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = false
  }
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
      <div class="text-sm text-muted">今日文法 · {{ items.length ? step + 1 : 0 }}/{{ items.length }}</div>
    </div>

    <div
      v-if="pending"
      class="space-y-3"
    >
      <USkeleton class="h-8 w-48" />
      <USkeleton class="h-40 w-full" />
    </div>

    <UCard v-else-if="!items.length">
      <p>今天沒有新的文法要學（本週的文法都已學過，或本週安排是複習週）。</p>
      <UButton
        class="mt-3"
        to="/knowledge?type=grammar"
        variant="soft"
        label="瀏覽文法清單"
      />
    </UCard>

    <template v-else-if="current">
      <UCard>
        <KpContent :kp="current" />
        <div
          v-if="current.state?.learnedAt"
          class="mt-3 text-xs text-muted"
        >
          已學過 · 熟練度 {{ current.state.mastery }}%
        </div>
      </UCard>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div class="flex gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-left"
            :disabled="step === 0"
            @click="step--"
          />
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-right"
            :disabled="step >= items.length - 1"
            @click="step++"
          />
        </div>
        <div class="flex gap-2">
          <UButton
            v-if="items.length > 1"
            variant="soft"
            color="neutral"
            label="全部一起練"
            :loading="starting"
            @click="drillAll"
          />
          <UButton
            size="lg"
            label="懂了，練 10 題"
            icon="i-lucide-pencil-line"
            :loading="starting"
            @click="drill(current)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

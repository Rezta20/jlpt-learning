<script setup lang="ts">
useHead({ title: '每日閱讀' })
const toastError = useToastError()
const toast = useToast()

const { data, refresh, pending } = await useFetch<{ passage: any | null }>('/api/reading/today')
const generating = ref(false)

async function generateNow() {
  generating.value = true
  try {
    const job = await $fetch<{ id: string }>('/api/jobs', { method: 'POST', body: { kind: 'passages', count: 1 } })
    const res = await $fetch<{ status: string, error?: string }>(`/api/jobs/${job.id}/step`, { method: 'POST' })
    if (res.status === 'failed') throw new Error(res.error || '生成失敗')
    toast.add({ title: '今天的文章準備好了', color: 'success' })
    await refresh()
  } catch (e) {
    toastError(e, '無法生成文章（需要 OpenAI 金鑰）')
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold tracking-tight">每日閱讀</h1>
      <div class="flex gap-2">
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          label="歷史"
          icon="i-lucide-history"
          to="/reading/list"
        />
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          label="貼上文章"
          icon="i-lucide-clipboard-paste"
          to="/import"
        />
      </div>
    </div>

    <div
      v-if="pending"
      class="space-y-3"
    >
      <USkeleton class="h-64 w-full" />
    </div>

    <PassageSession
      v-else-if="data?.passage"
      :key="data.passage.id"
      :passage="data.passage"
    />

    <UCard v-else>
      <p>今天還沒有可讀的文章。</p>
      <p class="mt-1 text-sm text-muted">文章由 AI 依你的程度、最近學的字和文法生成（一篇約 US$0.01–0.02）。</p>
      <div class="mt-3 flex gap-2">
        <UButton
          label="現在生成一篇"
          icon="i-lucide-sparkles"
          :loading="generating"
          @click="generateNow"
        />
        <UButton
          variant="soft"
          color="neutral"
          label="貼上自己的文章"
          to="/import"
        />
      </div>
    </UCard>
  </div>
</template>

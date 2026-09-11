<script setup lang="ts">
useHead({ title: '貼上文章' })
const toastError = useToastError()
const text = ref('')
const title = ref('')
const withQuestions = ref(true)
const loading = ref(false)

const { data: history, refresh } = await useFetch<{ items: { id: string, title: string | null, status: string, passageId: string | null, createdAt: string, preview: string }[] }>('/api/imports')

async function submit() {
  if (text.value.trim().length < 10) return
  loading.value = true
  try {
    const res = await $fetch<{ passageId: string }>('/api/imports', { method: 'POST', body: { text: text.value.trim(), title: title.value || undefined, withQuestions: withQuestions.value } })
    await refresh()
    await navigateTo(`/reading/${res.passageId}`)
  } catch (e) {
    toastError(e, '解析失敗（需要 OpenAI 金鑰）')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-semibold tracking-tight">貼上文章</h1>
    <p class="text-sm text-muted">
      貼上任何日文（課本段落、新聞、歌詞、朋友的訊息），AI 會分詞、標讀音、加上中文，變成可以點字查詢的閱讀頁；可選擇附 3 題讀解。一篇約 US$0.01–0.03。
    </p>
    <UCard>
      <div class="space-y-3">
        <UInput
          v-model="title"
          placeholder="標題（選填）"
          class="w-full"
        />
        <UTextarea
          v-model="text"
          :rows="8"
          placeholder="ここに日本語の文章を貼り付けてください。"
          class="ja w-full"
          :maxlength="4000"
        />
        <div class="flex items-center justify-between">
          <USwitch
            v-model="withQuestions"
            label="附 3 題讀解"
            size="sm"
          />
          <span class="text-xs text-muted tabular-nums">{{ text.length }}/4000</span>
        </div>
        <UButton
          block
          size="lg"
          label="解析並開始閱讀"
          icon="i-lucide-sparkles"
          :loading="loading"
          :disabled="text.trim().length < 10"
          @click="submit"
        />
      </div>
    </UCard>

    <UCard v-if="history?.items?.length">
      <template #header>
        <div class="font-medium">之前貼過的</div>
      </template>
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="i in history.items"
          :key="i.id"
          class="flex items-center justify-between gap-3 py-2"
        >
          <div class="min-w-0">
            <div class="ja truncate">{{ i.title || i.preview }}</div>
            <div class="text-xs text-muted">{{ fmtDateTime(i.createdAt) }} · {{ i.status }}</div>
          </div>
          <UButton
            v-if="i.passageId"
            size="xs"
            variant="soft"
            color="neutral"
            label="開啟"
            :to="`/reading/${i.passageId}`"
          />
        </li>
      </ul>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { qtypeLabel } from '~~/shared/types'

useHead({ title: '錯題本' })
const toastError = useToastError()
const { data, pending } = await useFetch<{ items: any[] }>('/api/mistakes')
const letters = ['A', 'B', 'C', 'D']
const open = ref<string | null>(null)
const starting = ref(false)

async function redo() {
  starting.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/sessions', { method: 'POST', body: { mode: 'mistakes', count: 20 } })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold tracking-tight">錯題本</h1>
      <UButton
        label="重做 20 題"
        icon="i-lucide-undo-2"
        :loading="starting"
        :disabled="!data?.items?.length"
        @click="redo"
      />
    </div>
    <p class="text-sm text-muted">最近 7 天答錯、或還沒答對回來的題目。答對之後會自動離開這裡。</p>

    <div
      v-if="pending"
      class="space-y-2"
    >
      <USkeleton
        v-for="i in 5"
        :key="i"
        class="h-14 w-full"
      />
    </div>
    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <ul class="divide-y divide-default">
        <li
          v-for="m in data?.items ?? []"
          :key="m.id"
          class="px-4 py-3"
        >
          <button
            class="w-full text-left"
            @click="open = open === m.id ? null : m.id"
          >
            <div class="flex items-start justify-between gap-3">
              <QuestionStem
                :stem="m.stem"
                class="text-base"
              />
              <span
                v-if="m.wrong_streak > 0"
                class="shrink-0 rounded bg-error/10 px-1.5 py-0.5 text-xs text-error"
              >連錯 {{ m.wrong_streak }}</span>
            </div>
            <div class="mt-1 text-xs text-muted">
              {{ m.level }} · {{ qtypeLabel(m.qtype) }}
              <span v-if="m.kps?.length"> · {{ m.kps.map((k: any) => k.term).join('、') }}</span>
              · {{ fmtDate(m.last_wrong_at) }}
            </div>
          </button>
          <ol
            v-if="open === m.id"
            class="ja mt-2 space-y-1 text-sm"
          >
            <li
              v-for="(o, i) in (m.options as string[])"
              :key="i"
              :class="i === m.answer_index ? 'font-medium text-success' : 'text-muted'"
            >
              {{ letters[i] }}. {{ o }}
            </li>
            <li class="pt-1">
              <NuxtLink
                v-for="k in m.kps"
                :key="k.id"
                :to="`/knowledge/${k.id}`"
                class="mr-2 text-xs text-primary hover:underline"
              >
                看「{{ k.term }}」解說
              </NuxtLink>
            </li>
          </ol>
        </li>
      </ul>
      <p
        v-if="!data?.items?.length"
        class="p-6 text-center text-sm text-muted"
      >
        目前沒有錯題
      </p>
    </UCard>
  </div>
</template>

<script setup lang="ts">
useHead({ title: '閱讀紀錄' })
const { data } = await useFetch<{ items: { id: string, level: string, title: string | null, scheduledFor: string | null, source: string, createdAt: string, readAt: string | null, correct: number | null, total: number | null, unknownCount: number }[] }>('/api/reading')
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <UButton
        variant="link"
        color="neutral"
        size="xs"
        icon="i-lucide-arrow-left"
        to="/reading"
      />
      <h1 class="text-2xl font-semibold tracking-tight">閱讀紀錄</h1>
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li
          v-for="p in data?.items ?? []"
          :key="p.id"
        >
          <NuxtLink
            :to="`/reading/${p.id}`"
            class="flex items-center gap-3 px-4 py-3 hover:bg-elevated/50"
          >
            <UBadge
              variant="outline"
              color="neutral"
              :label="p.level"
            />
            <div class="min-w-0 flex-1">
              <div class="ja truncate font-medium">{{ p.title || '（無標題）' }}</div>
              <div class="text-xs text-muted">
                {{ p.scheduledFor || fmtDate(p.createdAt) }} · {{ p.source === 'import' ? '自己貼上' : 'AI' }}
              </div>
            </div>
            <div class="text-right text-xs text-muted">
              <template v-if="p.readAt">
                <div>{{ p.correct }}/{{ p.total }}</div>
                <div>不會 {{ p.unknownCount }} 字</div>
              </template>
              <span v-else>未讀</span>
            </div>
          </NuxtLink>
        </li>
      </ul>
      <p
        v-if="!data?.items?.length"
        class="p-6 text-center text-sm text-muted"
      >
        還沒有文章
      </p>
    </UCard>
  </div>
</template>

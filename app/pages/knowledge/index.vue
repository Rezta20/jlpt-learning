<script setup lang="ts">
import type { KnowledgePointDto } from '~~/shared/types'
import { LEVELS } from '~~/shared/types'

useHead({ title: '知識點' })
const route = useRoute()
const router = useRouter()
const toastError = useToastError()

const q = reactive({
  type: (route.query.type as string) || 'grammar',
  level: (route.query.level as string) || '',
  filter: (route.query.filter as string) || 'all',
  sort: (route.query.sort as string) || 'default',
  q: (route.query.q as string) || '',
  page: Number(route.query.page || 1)
})
const debouncedQ = refDebounced(toRef(q, 'q'), 300)

const params = computed(() => ({
  type: q.type || undefined,
  level: q.level || undefined,
  filter: q.filter,
  sort: q.sort,
  q: debouncedQ.value || undefined,
  page: q.page,
  pageSize: 60
}))
watch(params, (p) => {
  router.replace({ query: Object.fromEntries(Object.entries({ ...p, pageSize: undefined }).filter(([, v]) => v != null && v !== '' && v !== 'all' && v !== 'default' && v !== 1)) as Record<string, string> })
})
watch(() => [q.type, q.level, q.filter, q.sort, debouncedQ.value], () => { q.page = 1 })

const { data, pending } = await useFetch<{ items: (KnowledgePointDto & { questionCount: number })[], total: number }>('/api/knowledge', { query: params, watch: [params] })

const selected = ref<Set<string>>(new Set())
function toggleSel(id: string) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
  selected.value = new Set(selected.value)
}
const starting = ref(false)
async function drillSelected() {
  if (!selected.value.size) return
  starting.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/learn/start', {
      method: 'POST',
      body: { kpIds: Array.from(selected.value), kind: q.type === 'grammar' ? 'grammar' : 'vocab', count: Math.min(40, selected.value.size * (q.type === 'grammar' ? 5 : 2)) }
    })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = false
  }
}

function masteryColor(m?: number | null, learned?: boolean) {
  if (!learned) return 'bg-elevated'
  if ((m ?? 0) >= 70) return 'bg-success'
  if ((m ?? 0) >= 40) return 'bg-warning'
  return 'bg-error'
}
const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / 60)))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">知識點</h1>
      <div class="text-sm text-muted tabular-nums">共 {{ data?.total ?? 0 }} 個</div>
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="t in [['grammar', '文法'], ['vocab', '單字']]"
        :key="t[0]"
        :label="t[1]"
        size="md"
        :variant="q.type === t[0] ? 'solid' : 'outline'"
        :color="q.type === t[0] ? 'primary' : 'neutral'"
        @click="q.type = t[0]!"
      />
      <USeparator
        orientation="vertical"
        class="h-8"
      />
      <UButton
        label="全部"
        size="md"
        :variant="!q.level ? 'solid' : 'outline'"
        :color="!q.level ? 'primary' : 'neutral'"
        @click="q.level = ''"
      />
      <UButton
        v-for="l in LEVELS.slice(0, 3)"
        :key="l"
        :label="l"
        size="md"
        :variant="q.level === l ? 'solid' : 'outline'"
        :color="q.level === l ? 'primary' : 'neutral'"
        @click="q.level = l"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="q.q"
        icon="i-lucide-search"
        placeholder="搜尋日文 / 讀音 / 中文"
        class="w-full sm:w-64"
        size="md"
      />
      <USelect
        v-model="q.filter"
        size="md"
        :items="[
          { label: '全部', value: 'all' },
          { label: '已學', value: 'learned' },
          { label: '未學', value: 'unlearned' },
          { label: '弱點', value: 'weak' },
          { label: '到期', value: 'due' }
        ]"
        class="w-28"
      />
      <USelect
        v-model="q.sort"
        size="md"
        :items="[
          { label: '預設順序', value: 'default' },
          { label: '熟練度低→高', value: 'mastery' },
          { label: '到期時間', value: 'due' },
          { label: '最近練過', value: 'recent' }
        ]"
        class="w-36"
      />
      <UButton
        v-if="selected.size"
        size="md"
        :label="`練選取的 ${selected.size} 個`"
        icon="i-lucide-pencil-line"
        :loading="starting"
        @click="drillSelected"
      />
    </div>

    <div
      v-if="pending && !data"
      class="space-y-2"
    >
      <USkeleton
        v-for="i in 8"
        :key="i"
        class="h-12 w-full"
      />
    </div>

    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <ul class="divide-y divide-default">
        <li
          v-for="kp in data?.items ?? []"
          :key="kp.id"
          class="flex min-h-12 items-center gap-3 px-4 py-3"
        >
          <UCheckbox
            :model-value="selected.has(kp.id)"
            @update:model-value="toggleSel(kp.id)"
          />
          <NuxtLink
            :to="`/knowledge/${kp.id}`"
            class="min-w-0 flex-1"
          >
            <div class="flex items-baseline gap-2">
              <span class="ja truncate text-lg font-medium">{{ kp.term }}</span>
              <span
                v-if="kp.reading && kp.reading !== kp.term"
                class="ja truncate text-sm text-muted"
              >{{ kp.reading }}</span>
            </div>
            <div class="truncate text-sm text-muted">{{ kp.content?.coreMeaning || kp.meaningZh }}</div>
          </NuxtLink>
          <div class="flex shrink-0 items-center gap-2 text-xs text-muted">
            <span class="hidden sm:inline">{{ kp.level }}</span>
            <span
              class="hidden sm:inline tabular-nums"
              :title="`${kp.questionCount} 題`"
            >{{ kp.questionCount }}題</span>
            <span
              class="inline-block size-2.5 rounded-full"
              :class="masteryColor(kp.state?.mastery, !!kp.state?.learnedAt)"
              :title="kp.state?.learnedAt ? `熟練度 ${kp.state.mastery}%` : '未學'"
            />
            <span class="w-9 text-right tabular-nums">{{ kp.state?.learnedAt ? `${kp.state.mastery}%` : '' }}</span>
          </div>
        </li>
      </ul>
      <div
        v-if="!data?.items?.length"
        class="p-6 text-center text-sm text-muted"
      >
        沒有符合的知識點
      </div>
    </UCard>

    <div
      v-if="totalPages > 1"
      class="flex justify-center"
    >
      <UPagination
        v-model:page="q.page"
        :total="data?.total ?? 0"
        :items-per-page="60"
        size="md"
      />
    </div>
  </div>
</template>

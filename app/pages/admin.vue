<script setup lang="ts">
useHead({ title: '後台' })
const toast = useToast()
const toastError = useToastError()

const { data: ov, refresh: refreshOv } = await useFetch<any>('/api/admin/overview')
const { data: jobs, refresh: refreshJobs } = await useFetch<{ items: any[] }>('/api/jobs')

const KIND_LABEL: Record<string, string> = {
  questions: '題目', grammar_content: '文法解說', vocab_content: '單字資料', passages: '閱讀文章'
}

// ---- new job form
const form = reactive({
  kind: 'questions' as 'questions' | 'grammar_content' | 'vocab_content' | 'passages',
  type: 'vocab' as 'vocab' | 'grammar',
  level: 'N4' as 'N5' | 'N4' | 'N3',
  target: 60,
  count: 7
})
const creating = ref(false)
async function createJob(autoRun = true) {
  creating.value = true
  try {
    const body: Record<string, unknown> = { kind: form.kind, level: form.level }
    if (form.kind === 'questions') Object.assign(body, { type: form.type, target: form.target })
    else if (form.kind === 'passages') Object.assign(body, { count: form.count })
    else Object.assign(body, { target: form.target })
    const job = await $fetch<{ id: string }>('/api/jobs', { method: 'POST', body })
    await refreshJobs()
    if (autoRun) runJob(job.id)
  } catch (e) {
    toastError(e)
  } finally {
    creating.value = false
  }
}

// ---- runner: client-driven chunk loop
const running = reactive<Record<string, boolean>>({})
const stopFlags = reactive<Record<string, boolean>>({})
async function runJob(id: string) {
  if (running[id]) return
  running[id] = true
  stopFlags[id] = false
  try {
    for (let i = 0; i < 400; i++) {
      if (stopFlags[id]) break
      const res = await $fetch<{ status: string, error?: string }>(`/api/jobs/${id}/step`, { method: 'POST' })
      await refreshJobs()
      if (res.status !== 'running') {
        if (res.status === 'failed') toast.add({ title: `任務失敗：${res.error}`, color: 'error' })
        else toast.add({ title: '任務完成', color: 'success' })
        break
      }
    }
    await refreshOv()
  } catch (e) {
    toastError(e)
  } finally {
    running[id] = false
  }
}
function stopJob(id: string) {
  stopFlags[id] = true
}
async function cancelJob(id: string) {
  stopFlags[id] = true
  await $fetch(`/api/jobs/${id}/cancel`, { method: 'POST' })
  await refreshJobs()
}

// ---- bootstrap: recommended initial jobs
const bootstrapping = ref(false)
async function bootstrap() {
  bootstrapping.value = true
  try {
    const specs: Record<string, unknown>[] = [
      { kind: 'grammar_content', level: 'N5', target: 60 },
      { kind: 'grammar_content', level: 'N4', target: 100 },
      { kind: 'vocab_content', level: 'N5', target: 700 },
      { kind: 'questions', type: 'grammar', level: 'N5', target: 150 },
      { kind: 'questions', type: 'vocab', level: 'N5', target: 200 },
      { kind: 'questions', type: 'grammar', level: 'N4', target: 200 },
      { kind: 'questions', type: 'vocab', level: 'N4', target: 200 },
      { kind: 'passages', level: 'N5', count: 5 }
    ]
    const ids: string[] = []
    for (const s of specs) {
      const j = await $fetch<{ id: string }>('/api/jobs', { method: 'POST', body: s })
      ids.push(j.id)
    }
    await refreshJobs()
    toast.add({ title: `已建立 ${ids.length} 個任務，依序執行中`, color: 'success' })
    for (const id of ids) await runJob(id)
  } catch (e) {
    toastError(e)
  } finally {
    bootstrapping.value = false
  }
}

// ---- flagged questions
async function setQuality(id: string, quality: 'ok' | 'disabled') {
  try {
    await $fetch(`/api/admin/questions/${id}`, { method: 'PATCH', body: { quality } })
    await refreshOv()
  } catch (e) {
    toastError(e)
  }
}

const pct = computed(() => (ov.value ? Math.min(100, Math.round(ov.value.usage.costUsd / ov.value.budgetUsd * 100)) : 0))
</script>

<template>
  <div
    v-if="ov"
    class="space-y-5"
  >
    <h1 class="text-2xl font-semibold tracking-tight">後台</h1>

    <UAlert
      v-if="!ov.hasOpenAiKey"
      color="warning"
      variant="soft"
      icon="i-lucide-key-round"
      title="尚未設定 OpenAI 金鑰"
      description="在環境變數 NUXT_OPENAI_API_KEY 填入金鑰後，才能生成題目、解說、文章。"
    />

    <!-- budget -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="font-medium">本月 AI 花費</div>
          <div class="text-sm text-muted">模型 {{ ov.model }}</div>
        </div>
      </template>
      <div class="flex items-end justify-between">
        <div class="text-2xl font-semibold tabular-nums">US${{ ov.usage.costUsd.toFixed(2) }} <span class="text-sm font-normal text-muted">/ {{ ov.budgetUsd }}</span></div>
        <div class="text-xs text-muted tabular-nums">{{ ov.usage.calls }} 次呼叫 · 輸入 {{ (ov.usage.inputTokens / 1000).toFixed(0) }}k · 輸出 {{ (ov.usage.outputTokens / 1000).toFixed(0) }}k tokens</div>
      </div>
      <UProgress
        :model-value="pct"
        class="mt-2"
        size="sm"
        :color="pct > 90 ? 'error' : 'primary'"
      />
      <ul
        v-if="ov.usageByKind.length"
        class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"
      >
        <li
          v-for="u in ov.usageByKind"
          :key="u.kind"
        >
          {{ u.kind }} {{ u.calls }} 次 · ${{ u.cost.toFixed(2) }}
        </li>
      </ul>
      <p class="mt-2 text-xs text-muted">金額為估算（依模型公開單價換算）。實際以 OpenAI 帳單為準。達到預算後系統會停止呼叫 AI。</p>
    </UCard>

    <!-- inventory -->
    <div class="grid gap-4 md:grid-cols-2">
      <UCard>
        <template #header>
          <div class="font-medium">知識點庫存</div>
        </template>
        <table class="w-full text-sm">
          <thead class="text-xs text-muted">
            <tr>
              <th class="text-left font-normal">範圍</th>
              <th class="text-right font-normal">總數</th>
              <th class="text-right font-normal">有解說</th>
              <th class="text-right font-normal">有題目</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="k in ov.kpCounts"
              :key="k.level + k.type"
              class="border-t border-default"
            >
              <td class="py-1">{{ k.level }} {{ k.type === 'vocab' ? '單字' : '文法' }}</td>
              <td class="py-1 text-right tabular-nums">{{ k.n }}</td>
              <td class="py-1 text-right tabular-nums">{{ k.ready }}</td>
              <td class="py-1 text-right tabular-nums">{{ k.with_q }}</td>
            </tr>
          </tbody>
        </table>
      </UCard>
      <UCard>
        <template #header>
          <div class="font-medium">題庫</div>
        </template>
        <div class="max-h-56 overflow-auto">
          <table class="w-full text-sm">
            <tbody>
              <tr
                v-for="q in ov.qCounts"
                :key="q.level + q.skill + q.qtype"
                class="border-t border-default first:border-0"
              >
                <td class="py-1">{{ q.level }}</td>
                <td class="py-1 text-muted">{{ q.skill }} · {{ q.qtype }}</td>
                <td class="py-1 text-right tabular-nums">{{ q.n }}</td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="!ov.qCounts.length"
            class="text-sm text-muted"
          >
            還沒有題目。
          </p>
        </div>
        <div class="mt-2 text-xs text-muted">
          文章：<span
            v-for="p in ov.passages"
            :key="p.level"
            class="mr-2"
          >{{ p.level }} {{ p.n }} 篇（排程 {{ p.scheduled }}）</span>
        </div>
      </UCard>
    </div>

    <!-- bootstrap -->
    <UCard v-if="!ov.qCounts.length">
      <template #header>
        <div class="font-medium">第一次使用：一鍵建立初始題庫</div>
      </template>
      <p class="text-sm text-muted">
        題庫已用種子資料建好，平常刷題不呼叫 AI。這裡只在你想「再生成一批」或補中文解說時才用。月預算預設 US$3，到了就停。
      </p>
      <UButton
        class="mt-3"
        label="開始建立"
        icon="i-lucide-sparkles"
        :loading="bootstrapping"
        :disabled="!ov.hasOpenAiKey"
        @click="bootstrap"
      />
    </UCard>

    <!-- new job -->
    <UCard>
      <template #header>
        <div class="font-medium">新增生成任務</div>
      </template>
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="種類">
          <USelect
            v-model="form.kind"
            :items="[
              { label: '題目', value: 'questions' },
              { label: '文法解說', value: 'grammar_content' },
              { label: '單字資料（中文、例句）', value: 'vocab_content' },
              { label: '閱讀文章', value: 'passages' }
            ]"
            class="w-48"
          />
        </UFormField>
        <UFormField
          v-if="form.kind === 'questions'"
          label="類型"
        >
          <USelect
            v-model="form.type"
            :items="[{ label: '單字', value: 'vocab' }, { label: '文法', value: 'grammar' }]"
            class="w-28"
          />
        </UFormField>
        <UFormField label="等級">
          <USelect
            v-model="form.level"
            :items="['N5', 'N4', 'N3']"
            class="w-24"
          />
        </UFormField>
        <UFormField
          v-if="form.kind === 'passages'"
          label="篇數"
        >
          <UInputNumber
            v-model="form.count"
            :min="1"
            :max="30"
            class="w-28"
          />
        </UFormField>
        <UFormField
          v-else
          :label="form.kind === 'questions' ? '目標題數' : '目標數量'"
        >
          <UInputNumber
            v-model="form.target"
            :min="5"
            :max="2000"
            :step="10"
            class="w-32"
          />
        </UFormField>
        <UButton
          label="建立並執行"
          icon="i-lucide-play"
          :loading="creating"
          :disabled="!ov.hasOpenAiKey"
          @click="createJob(true)"
        />
      </div>
      <p class="mt-2 text-xs text-muted">
        參考成本（gpt-5.4-mini）：題目約 US$0.01–0.02/題組（一次 12–24 題）、文法解說約 $0.01/個、單字資料約 $0.002/個、文章約 $0.02/篇。
      </p>
    </UCard>

    <!-- jobs -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="font-medium">任務</div>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-refresh-cw"
            @click="refreshJobs(); refreshOv()"
          />
        </div>
      </template>
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="j in jobs?.items ?? []"
          :key="j.id"
          class="flex items-center gap-3 px-4 py-2.5"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ KIND_LABEL[j.kind] ?? j.kind }}</span>
              <span class="text-muted">{{ j.params?.level }} {{ j.params?.type === 'vocab' ? '單字' : j.params?.type === 'grammar' ? '文法' : '' }}</span>
              <UBadge
                size="sm"
                variant="soft"
                :color="j.status === 'done' ? 'success' : j.status === 'failed' ? 'error' : j.status === 'running' ? 'primary' : 'neutral'"
                :label="j.status"
              />
            </div>
            <div class="text-xs text-muted tabular-nums">
              {{ j.produced }} / {{ j.target }} · 第 {{ j.cursor }} 批 · {{ fmtDateTime(j.createdAt) }}
              <span
                v-if="j.error"
                class="text-error"
              > · {{ j.error }}</span>
            </div>
          </div>
          <div class="flex shrink-0 gap-1">
            <UButton
              v-if="(j.status === 'pending' || j.status === 'running' || j.status === 'failed') && !running[j.id]"
              size="xs"
              variant="soft"
              icon="i-lucide-play"
              :label="j.status === 'failed' ? '重試' : '執行'"
              :disabled="!ov.hasOpenAiKey"
              @click="runJob(j.id)"
            />
            <UButton
              v-if="running[j.id]"
              size="xs"
              variant="soft"
              color="neutral"
              icon="i-lucide-pause"
              label="暫停"
              loading
              @click="stopJob(j.id)"
            />
            <UButton
              v-if="j.status !== 'done' && j.status !== 'cancelled'"
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              @click="cancelJob(j.id)"
            />
          </div>
        </li>
      </ul>
      <p
        v-if="!jobs?.items?.length"
        class="p-6 text-center text-sm text-muted"
      >
        還沒有任務
      </p>
    </UCard>

    <!-- flagged -->
    <UCard v-if="ov.flagged.length">
      <template #header>
        <div class="font-medium">回報 / 可疑題目</div>
      </template>
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="q in ov.flagged"
          :key="q.id"
          class="flex items-start gap-3 py-2"
        >
          <div class="min-w-0 flex-1">
            <QuestionStem
              :stem="q.stem"
              class="text-base"
            />
            <div class="text-xs text-muted">{{ q.level }} · {{ q.qtype }} · {{ q.quality }} · 回報 {{ q.flags_count }} · 答對 {{ q.times_correct }}/{{ q.times_answered }}</div>
          </div>
          <div class="flex shrink-0 gap-1">
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              label="沒問題"
              @click="setQuality(q.id, 'ok')"
            />
            <UButton
              size="xs"
              variant="soft"
              color="error"
              label="停用"
              @click="setQuality(q.id, 'disabled')"
            />
          </div>
        </li>
      </ul>
    </UCard>
  </div>
</template>

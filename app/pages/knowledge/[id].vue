<script setup lang="ts">
import type { KnowledgePointDto } from '~~/shared/types'
import { qtypeLabel } from '~~/shared/types'

const route = useRoute()
const id = route.params.id as string
const toastError = useToastError()
const toast = useToast()

type Detail = KnowledgePointDto & {
  questions: { id: string, qtype: string, stem: string, level: string, skill: string, quality: string, timesAnswered: number, timesCorrect: number }[]
  history: { at: string, isCorrect: boolean, responseMs: number, qtype: string }[]
}
const { data: kp, refresh, error } = await useFetch<Detail>(`/api/knowledge/${id}`)
if (error.value) throw createError({ statusCode: 404, statusMessage: '找不到這個知識點' })
useHead({ title: kp.value?.term ?? '知識點' })

const starting = ref(false)
async function drill() {
  if (!kp.value) return
  starting.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/learn/start', { method: 'POST', body: { kpIds: [kp.value.id], kind: kp.value.type, count: 10 } })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = false
  }
}

const generating = ref(false)
async function generate(kind: 'content' | 'questions') {
  if (!kp.value) return
  generating.value = true
  try {
    const body = kind === 'content'
      ? { kind: kp.value.type === 'grammar' ? 'grammar_content' : 'vocab_content', level: kp.value.level, target: 1, kpIds: [kp.value.id] }
      : { kind: 'questions', type: kp.value.type, level: kp.value.level, target: kp.value.type === 'grammar' ? 8 : 5, kpIds: [kp.value.id], perKp: kp.value.type === 'grammar' ? 8 : 5, minQuestions: 30 }
    const job = await $fetch<{ id: string }>('/api/jobs', { method: 'POST', body })
    const res = await $fetch<{ status: string, error?: string, produced: number }>(`/api/jobs/${job.id}/step`, { method: 'POST' })
    if (res.status === 'failed') throw new Error(res.error || '生成失敗')
    toast.add({ title: kind === 'content' ? '解說已生成' : `已新增 ${res.produced} 題`, color: 'success' })
    await refresh()
  } catch (e) {
    toastError(e)
  } finally {
    generating.value = false
  }
}

// edit video url
const editing = ref(false)
const videoUrl = ref('')
async function saveVideo() {
  try {
    await $fetch(`/api/knowledge/${id}`, { method: 'PATCH', body: { videoUrl: videoUrl.value || null } })
    editing.value = false
    await refresh()
  } catch (e) {
    toastError(e)
  }
}

const acc = computed(() => {
  const s = kp.value?.state
  if (!s || !s.attempts) return null
  return Math.round((s.correct / s.attempts) * 100)
})
</script>

<template>
  <div
    v-if="kp"
    class="space-y-5"
  >
    <UButton
      variant="link"
      color="neutral"
      size="xs"
      icon="i-lucide-arrow-left"
      label="返回"
      @click="$router.back()"
    />

    <UCard>
      <KpContent :kp="kp" />
      <div class="mt-4 flex flex-wrap gap-2">
        <UButton
          label="練 10 題"
          icon="i-lucide-pencil-line"
          :loading="starting"
          :disabled="!kp.questions.length"
          @click="drill"
        />
        <UButton
          v-if="!kp.contentReady"
          variant="soft"
          color="neutral"
          label="用 AI 生成解說"
          icon="i-lucide-sparkles"
          :loading="generating"
          @click="generate('content')"
        />
        <UButton
          v-if="kp.questions.length < 5"
          variant="soft"
          color="neutral"
          :label="kp.questions.length ? '再生成幾題' : '生成題目'"
          icon="i-lucide-sparkles"
          :loading="generating"
          @click="generate('questions')"
        />
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :label="kp.videoUrl ? '修改影片連結' : '加上影片連結'"
          icon="i-lucide-link"
          @click="editing = !editing; videoUrl = kp.videoUrl ?? ''"
        />
      </div>
      <div
        v-if="editing"
        class="mt-3 flex gap-2"
      >
        <UInput
          v-model="videoUrl"
          placeholder="https://www.youtube.com/watch?v=..."
          class="flex-1"
          size="sm"
        />
        <UButton
          size="sm"
          label="儲存"
          @click="saveVideo"
        />
      </div>
    </UCard>

    <div class="grid gap-4 md:grid-cols-2">
      <UCard>
        <template #header>
          <div class="font-medium">我的狀況</div>
        </template>
        <dl
          v-if="kp.state?.learnedAt"
          class="grid grid-cols-2 gap-y-2 text-sm"
        >
          <dt class="text-muted">熟練度</dt>
          <dd class="tabular-nums">{{ kp.state.mastery }}%</dd>
          <dt class="text-muted">答題</dt>
          <dd class="tabular-nums">{{ kp.state.correct }}/{{ kp.state.attempts }}<span v-if="acc != null"> ({{ acc }}%)</span></dd>
          <dt class="text-muted">下次複習</dt>
          <dd>{{ fmtDateTime(kp.state.due) }}</dd>
          <dt class="text-muted">忘記次數</dt>
          <dd class="tabular-nums">{{ kp.state.lapses }}</dd>
          <dt class="text-muted">開始學習</dt>
          <dd>{{ fmtDate(kp.state.learnedAt) }}</dd>
        </dl>
        <p
          v-else
          class="text-sm text-muted"
        >
          還沒學過。按「練 10 題」會開始排入複習。
        </p>
        <div
          v-if="kp.history.length"
          class="mt-3"
        >
          <div class="mb-1 text-xs text-muted">最近作答（新→舊）</div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="(h, i) in kp.history"
              :key="i"
              class="inline-block size-3 rounded-sm"
              :class="h.isCorrect ? 'bg-success' : 'bg-error'"
              :title="`${qtypeLabel(h.qtype)} · ${fmtDateTime(h.at)}`"
            />
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="font-medium">題目 {{ kp.questions.length }}</div>
        </template>
        <ul class="max-h-80 space-y-2 overflow-auto text-sm">
          <li
            v-for="qq in kp.questions"
            :key="qq.id"
            class="border-b border-default pb-2 last:border-0"
          >
            <div class="mb-0.5 text-xs text-muted">
              {{ qtypeLabel(qq.qtype) }}
              <span v-if="qq.timesAnswered"> · {{ qq.timesCorrect }}/{{ qq.timesAnswered }}</span>
              <span
                v-if="qq.quality !== 'ok'"
                class="text-warning"
              > · {{ qq.quality }}</span>
            </div>
            <QuestionStem
              :stem="qq.stem"
              class="text-base"
            />
          </li>
        </ul>
        <p
          v-if="!kp.questions.length"
          class="text-sm text-muted"
        >
          還沒有題目。
        </p>
      </UCard>
    </div>
  </div>
</template>

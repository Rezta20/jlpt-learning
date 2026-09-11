<script setup lang="ts">
import type { PassageToken, AnswerResult } from '~~/shared/types'

interface PassageDto {
  id: string
  level: string
  title: string | null
  body: string
  tokens: PassageToken[]
  summaryZh: string | null
  source: string
  sessionId: string | null
  questions: { id: string, stem: string, options: string[], qtype: string }[]
  answeredMap: Record<string, { chosenIndex: number, isCorrect: boolean }>
  read: { unknownTokens: string[], correct: number, total: number, readAt: string } | null
  kpByTerm: Record<string, { id: string, learned: boolean }>
}

const props = defineProps<{ passage: PassageDto }>()
const emit = defineEmits<{ (e: 'finished'): void }>()
const toast = useToast()
const toastError = useToastError()

const letters = ['A', 'B', 'C', 'D']
const unknown = ref<string[]>([...(props.passage.read?.unknownTokens ?? [])])
const kpByTerm = reactive<Record<string, { id: string, learned: boolean }>>({ ...props.passage.kpByTerm })
const answered = reactive<Record<string, { chosenIndex: number, isCorrect: boolean }>>({ ...props.passage.answeredMap })
const results = reactive<Record<string, AnswerResult>>({})
const showFurigana = ref(false)
const showSummary = ref(false)
const finished = ref(!!props.passage.read?.readAt)
const finishing = ref(false)
const finishXp = ref(0)
const phase = ref<'read' | 'questions'>(Object.keys(answered).length ? 'questions' : 'read')

function markUnknown(s: string) {
  const i = unknown.value.indexOf(s)
  if (i === -1) unknown.value.push(s)
  else unknown.value.splice(i, 1)
}

async function addWord(t: PassageToken) {
  try {
    const res = await $fetch<{ id: string, term: string }>(`/api/reading/${props.passage.id}/words`, { method: 'POST', body: { surface: t.s, reading: t.r, meaning: t.m } })
    kpByTerm[t.s] = { id: res.id, learned: true }
    if (!unknown.value.includes(t.s)) unknown.value.push(t.s)
    toast.add({ title: `已加入「${t.s}」到複習排程`, color: 'success' })
  } catch (e) {
    toastError(e)
  }
}

const shownAt = ref(Date.now())
async function choose(qid: string, i: number) {
  if (answered[qid] || !props.passage.sessionId) return
  try {
    const res = await $fetch<AnswerResult>(`/api/sessions/${props.passage.sessionId}/answers`, {
      method: 'POST',
      body: { questionId: qid, chosenIndex: i, responseMs: Date.now() - shownAt.value }
    })
    answered[qid] = { chosenIndex: i, isCorrect: res.isCorrect }
    results[qid] = res
    shownAt.value = Date.now()
  } catch (e) {
    toastError(e)
  }
}

const allAnswered = computed(() => props.passage.questions.every(q => answered[q.id]))
const correctCount = computed(() => Object.values(answered).filter(a => a.isCorrect).length)

async function finish() {
  finishing.value = true
  try {
    const res = await $fetch<{ xp: number }>(`/api/reading/${props.passage.id}/finish`, { method: 'POST', body: { unknownTokens: unknown.value } })
    finishXp.value = res.xp
    finished.value = true
    emit('finished')
  } catch (e) {
    toastError(e)
  } finally {
    finishing.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
      <UBadge
        variant="outline"
        color="neutral"
        :label="passage.level"
      />
      <span>{{ passage.source === 'import' ? '自己貼上的文章' : '每日閱讀' }}</span>
      <span class="flex-1" />
      <USwitch
        v-model="showFurigana"
        label="假名"
        size="xs"
      />
    </div>

    <UCard>
      <PassageReader
        :title="passage.title"
        :tokens="passage.tokens"
        :body="passage.body"
        :kp-by-term="kpByTerm"
        :unknown="unknown"
        :show-furigana="showFurigana"
        @mark-unknown="markUnknown"
        @add-word="addWord"
      />
      <p class="mt-4 text-xs text-muted">
        點任何字看讀音和意思；不會的字按「加入單字複習」，之後會出現在練習裡。
      </p>
    </UCard>

    <div
      v-if="phase === 'read'"
      class="flex justify-end"
    >
      <UButton
        size="lg"
        label="讀完了，回答 3 題"
        trailing-icon="i-lucide-arrow-right"
        @click="phase = 'questions'; shownAt = Date.now()"
      />
    </div>

    <template v-else>
      <UCard
        v-for="(q, qi) in passage.questions"
        :key="q.id"
      >
        <div class="mb-2 text-xs text-muted">問題 {{ qi + 1 }}</div>
        <QuestionStem :stem="q.stem" />
        <div class="mt-3 grid gap-2">
          <button
            v-for="(opt, i) in q.options"
            :key="i"
            type="button"
            class="ja flex min-h-12 w-full items-start gap-3 rounded-lg border px-3 py-3 text-left touch-manipulation"
            :class="[
              !answered[q.id] ? 'border-default [@media(hover:hover)]:hover:border-primary/60 [@media(hover:hover)]:hover:bg-elevated/50' : 'cursor-default',
              answered[q.id] && results[q.id] && i === results[q.id]!.answerIndex ? 'border-success bg-success/10' : '',
              answered[q.id] && i === answered[q.id]!.chosenIndex && results[q.id] && i !== results[q.id]!.answerIndex ? 'border-error bg-error/10' : '',
              answered[q.id] && !results[q.id] && i === answered[q.id]!.chosenIndex ? (answered[q.id]!.isCorrect ? 'border-success bg-success/10' : 'border-error bg-error/10') : '',
              answered[q.id] && results[q.id] && i !== answered[q.id]!.chosenIndex && i !== results[q.id]!.answerIndex ? 'opacity-50' : ''
            ]"
            :disabled="!!answered[q.id]"
            @click="choose(q.id, i)"
          >
            <span class="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded border border-default text-xs text-muted">{{ letters[i] }}</span>
            <span>{{ opt }}</span>
          </button>
        </div>
        <div
          v-if="results[q.id]"
          class="mt-3"
        >
          <ExplanationPanel
            :explanation="results[q.id]!.explanation"
            :options="q.options"
            :answer-index="results[q.id]!.answerIndex"
            :chosen-index="answered[q.id]?.chosenIndex ?? null"
            :extra="results[q.id]!.extraExplanations"
            :question-id="q.id"
            compact
          />
        </div>
      </UCard>

      <UCard v-if="passage.summaryZh">
        <button
          class="flex w-full items-center justify-between text-sm"
          @click="showSummary = !showSummary"
        >
          <span class="font-medium">中文大意</span>
          <UIcon :name="showSummary ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" />
        </button>
        <p
          v-show="showSummary"
          class="mt-2 text-[15px]"
        >
          {{ passage.summaryZh }}
        </p>
      </UCard>

      <div class="flex items-center justify-between">
        <div class="text-sm text-muted">
          <span v-if="unknown.length">標記不會 {{ unknown.length }} 個字 · </span>
          答對 {{ correctCount }}/{{ passage.questions.length }}
        </div>
        <UButton
          v-if="!finished"
          size="lg"
          label="完成閱讀"
          icon="i-lucide-check"
          :disabled="!allAnswered && passage.questions.length > 0"
          :loading="finishing"
          @click="finish"
        />
        <div
          v-else
          class="text-sm text-success"
        >
          已完成 <span v-if="finishXp">· +{{ finishXp }} XP</span>
        </div>
      </div>
    </template>
  </div>
</template>

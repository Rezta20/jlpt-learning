<script setup lang="ts">
import type { SessionDto, AnswerResult, QuestionDto } from '~~/shared/types'
import { qtypeLabel } from '~~/shared/types'

definePageMeta({ layout: 'focus' })
const route = useRoute()
const id = route.params.id as string
const toastError = useToastError()
const toast = useToast()

const { data: session, error } = await useFetch<SessionDto>(`/api/sessions/${id}`)
if (error.value) throw createError({ statusCode: 404, statusMessage: '找不到這個練習' })
useHead({ title: '練習' })

const letters = ['A', 'B', 'C', 'D']
const MODE_LABEL: Record<string, string> = {
  quick: '快速練習', daily: '每日練習', learn: '學習練習', mock: '模考', reading: '閱讀', mistakes: '錯題重做', baseline: '基準測驗', weak: '弱點加強'
}

// ---- state
const questions = computed(() => session.value?.questions ?? [])
const answered = reactive<Record<string, { chosenIndex: number, isCorrect: boolean }>>({ ...(session.value?.answeredMap ?? {}) })
const firstUnanswered = questions.value.findIndex(q => !answered[q.id])
const index = ref(firstUnanswered === -1 ? Math.max(0, questions.value.length - 1) : firstUnanswered)
const current = computed<QuestionDto | undefined>(() => questions.value[index.value])
const result = ref<AnswerResult | null>(null)
const submitting = ref(false)
const finished = ref(false)
const finishData = ref<{ xp: number, total: number, answered: number, correct: number, durationMs: number, mock: { scaled: Record<string, number>, estimateTotal: number, bySection: Record<string, { total: number, correct: number }> } | null } | null>(null)
const shownAt = ref(Date.now())
const showPassage = ref(true)
const sessionXp = ref(0)

const answeredCount = computed(() => Object.keys(answered).length)
const correctCount = computed(() => Object.values(answered).filter(a => a.isCorrect).length)
const progress = computed(() => (questions.value.length ? Math.round((answeredCount.value / questions.value.length) * 100) : 0))

// ---- timer (mock / baseline)
const timeLeft = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  if (session.value?.timeLimitSec) {
    const end = new Date(session.value.startedAt).getTime() + session.value.timeLimitSec * 1000
    const tick = () => {
      timeLeft.value = Math.max(0, Math.floor((end - Date.now()) / 1000))
      if (timeLeft.value <= 0 && !finished.value) finish()
    }
    tick()
    timer = setInterval(tick, 1000)
  }
  window.addEventListener('keydown', onKey)
  if (session.value?.finishedAt) finished.value = true
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('keydown', onKey)
})
const timeLabel = computed(() => {
  if (timeLeft.value == null) return ''
  const m = Math.floor(timeLeft.value / 60)
  const s = timeLeft.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

// ---- passage grouping: reuse same passage for consecutive questions
const prevPassageId = computed(() => (index.value > 0 ? questions.value[index.value - 1]?.passage?.id : null))
const isNewPassage = computed(() => !!current.value?.passage && current.value.passage.id !== prevPassageId.value)
const pendingChoice = ref<number | null>(null)
watch(index, () => {
  shownAt.value = Date.now()
  result.value = null
  pendingChoice.value = null
  if (isNewPassage.value) showPassage.value = true
})
const chosen = computed(() => {
  if (pendingChoice.value != null) return pendingChoice.value
  return current.value ? answered[current.value.id]?.chosenIndex ?? null : null
})
const isMock = computed(() => session.value?.mode === 'mock' || session.value?.mode === 'baseline')

async function choose(i: number) {
  const q = current.value
  if (!q || submitting.value || chosen.value != null) return
  submitting.value = true
  pendingChoice.value = i
  try {
    const res = await $fetch<AnswerResult>(`/api/sessions/${id}/answers`, {
      method: 'POST',
      body: { questionId: q.id, chosenIndex: i, responseMs: Date.now() - shownAt.value }
    })
    answered[q.id] = { chosenIndex: i, isCorrect: res.isCorrect }
    sessionXp.value += res.xpGained
    if (current.value?.id !== q.id) return
    result.value = res
    if (isMock.value) setTimeout(next, 150)
  } catch (e) {
    if (current.value?.id === q.id) pendingChoice.value = null
    toastError(e)
  } finally {
    submitting.value = false
  }
}

function next() {
  if (index.value < questions.value.length - 1) {
    index.value++
  } else {
    finish()
  }
}

function prev() {
  if (index.value > 0) index.value--
}

async function finish() {
  if (finished.value) return
  finished.value = true
  if (timer) clearInterval(timer)
  try {
    finishData.value = await $fetch(`/api/sessions/${id}/finish`, { method: 'POST' })
    if (finishData.value && finishData.value.xp > 0) sessionXp.value += finishData.value.xp
  } catch (e) {
    toastError(e)
  }
}

function onKey(e: KeyboardEvent) {
  if (finished.value) return
  const target = e.target as HTMLElement
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
  if (['1', '2', '3', '4'].includes(e.key) && chosen.value == null) choose(Number(e.key) - 1)
  else if ((e.key === 'Enter' || e.key === ' ') && chosen.value != null) {
    e.preventDefault()
    next()
  }
}

async function again() {
  try {
    const cfg = session.value?.config as Record<string, unknown>
    const mode = session.value?.mode
    let body: Record<string, unknown>
    if (mode === 'daily') body = { mode: 'daily', block: cfg.block }
    else if (mode === 'mistakes' || mode === 'weak' || mode === 'baseline') body = { mode }
    else if (mode === 'learn') body = { mode: 'learn', kpIds: cfg.kpIds ?? [] }
    else body = { mode: 'quick', skills: cfg.skills ?? ['vocab', 'grammar'], levels: cfg.levels ?? [], autoLevel: cfg.autoLevel ?? true, mix: cfg.mix ?? true, count: session.value?.total ?? 20 }
    const res = await $fetch<{ id: string }>('/api/sessions', { method: 'POST', body })
    await navigateTo(`/practice/${res.id}`, { replace: true })
    window.location.reload()
  } catch (e) {
    toastError(e)
  }
}

const wrongList = computed(() => questions.value.filter(q => answered[q.id] && !answered[q.id]!.isCorrect))
const reviewIndex = ref<number | null>(null)
const reviewQ = computed(() => (reviewIndex.value == null ? null : wrongList.value[reviewIndex.value] ?? null))
const reviewResult = ref<AnswerResult | null>(null)
async function openReview(i: number) {
  reviewIndex.value = i
  const q = wrongList.value[i]
  if (!q) return
  // Re-post the same answer: server is idempotent and returns explanation without re-scoring
  try {
    reviewResult.value = await $fetch<AnswerResult>(`/api/sessions/${id}/answers`, {
      method: 'POST',
      body: { questionId: q.id, chosenIndex: answered[q.id]!.chosenIndex, responseMs: 0 }
    })
  } catch (e) {
    toastError(e)
  }
}

function copyToast() {
  toast.add({ title: '已複製', color: 'neutral' })
}
void copyToast
</script>

<template>
  <div v-if="session">
    <!-- top bar -->
    <div class="mb-4 flex items-center gap-3">
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="sm"
        aria-label="離開"
        to="/"
      />
      <div class="flex-1">
        <UProgress
          :model-value="progress"
          size="sm"
        />
      </div>
      <div class="text-sm tabular-nums text-muted">
        {{ Math.min(answeredCount + (chosen == null && !finished ? 1 : 0), questions.length) }}/{{ questions.length }}
      </div>
      <div
        v-if="timeLabel"
        class="rounded bg-elevated px-2 py-0.5 text-sm tabular-nums"
        :class="timeLeft !== null && timeLeft < 60 ? 'text-error' : ''"
      >
        {{ timeLabel }}
      </div>
    </div>

    <!-- finished summary -->
    <div
      v-if="finished"
      class="space-y-5"
    >
      <UCard>
        <div class="text-sm text-muted">{{ MODE_LABEL[session.mode] }} · 完成</div>
        <div class="mt-2 flex items-end gap-6">
          <div>
            <div class="text-4xl font-semibold tabular-nums">{{ correctCount }}<span class="text-xl text-muted">/{{ questions.length }}</span></div>
            <div class="text-sm text-muted">正確</div>
          </div>
          <div>
            <div class="text-2xl font-semibold tabular-nums">{{ questions.length ? Math.round(correctCount / Math.max(1, answeredCount) * 100) : 0 }}%</div>
            <div class="text-sm text-muted">正確率</div>
          </div>
          <div>
            <div class="text-2xl font-semibold tabular-nums">+{{ sessionXp }}</div>
            <div class="text-sm text-muted">XP</div>
          </div>
        </div>
        <div
          v-if="finishData?.mock"
          class="mt-4 grid grid-cols-3 gap-3 text-sm"
        >
          <div
            v-for="(v, sec) in finishData.mock.scaled"
            :key="sec"
            class="rounded-md bg-elevated/60 p-3"
          >
            <div class="text-muted">{{ sec === 'language' ? '言語知識' : sec === 'reading' ? '読解' : '聴解' }}</div>
            <div class="text-xl font-semibold tabular-nums">{{ v }}<span class="text-sm text-muted">/60</span></div>
            <div class="text-xs text-muted">{{ finishData.mock.bySection[sec]?.correct }}/{{ finishData.mock.bySection[sec]?.total }} 題</div>
          </div>
          <div class="col-span-3 text-muted">
            估算總分 <b class="text-default">{{ finishData.mock.estimateTotal }}</b> / 180（合格線 95；各科 ≥ 19）— 僅供追蹤趨勢
          </div>
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <UButton
            label="回今日"
            to="/"
            icon="i-lucide-home"
          />
          <UButton
            label="再來一組"
            variant="soft"
            icon="i-lucide-rotate-cw"
            @click="again"
          />
          <UButton
            v-if="session.mode === 'learn' || session.mode === 'daily'"
            label="回今日清單"
            variant="ghost"
            color="neutral"
            to="/"
          />
        </div>
      </UCard>

      <UCard v-if="wrongList.length">
        <template #header>
          <div class="font-medium">這次錯的 {{ wrongList.length }} 題</div>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="(q, i) in wrongList"
            :key="q.id"
            class="py-3"
          >
            <button
              class="w-full text-left"
              @click="reviewIndex === i ? (reviewIndex = null) : openReview(i)"
            >
              <div class="flex items-start justify-between gap-3">
                <QuestionStem
                  :stem="q.stem"
                  class="text-base"
                />
                <UIcon
                  :name="reviewIndex === i ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="mt-1 size-4 shrink-0 text-muted"
                />
              </div>
              <div class="mt-1 text-xs text-muted">
                {{ qtypeLabel(q.qtype) }} · 你選 {{ letters[answered[q.id]!.chosenIndex] }}
                <span v-if="q.knowledgePoints?.length"> · {{ q.knowledgePoints?.map(k => k.term).join('、') }}</span>
              </div>
            </button>
            <div
              v-if="reviewIndex === i && reviewResult && reviewQ"
              class="mt-3 space-y-3"
            >
              <ol class="ja space-y-1 text-sm">
                <li
                  v-for="(o, oi) in reviewQ.options"
                  :key="oi"
                  :class="oi === reviewResult.answerIndex ? 'text-success font-medium' : oi === answered[reviewQ.id]?.chosenIndex ? 'text-error line-through' : 'text-muted'"
                >
                  {{ letters[oi] }}. {{ o }}
                </li>
              </ol>
              <ExplanationPanel
                :explanation="reviewResult.explanation"
                :options="reviewQ.options"
                :answer-index="reviewResult.answerIndex"
                :chosen-index="answered[reviewQ.id]?.chosenIndex ?? null"
                :extra="reviewResult.extraExplanations"
                :question-id="reviewQ.id"
              />
            </div>
          </li>
        </ul>
      </UCard>
    </div>

    <!-- question -->
    <div
      v-else-if="current"
      class="space-y-4"
    >
      <!-- passage -->
      <UCard
        v-if="current.passage"
        :ui="{ body: 'p-4 sm:p-5' }"
      >
        <button
          class="flex w-full items-center justify-between text-sm text-muted"
          @click="showPassage = !showPassage"
        >
          <span>文章 {{ current.passage.title ? `· ${current.passage.title}` : '' }}</span>
          <UIcon :name="showPassage ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" />
        </button>
        <div
          v-show="showPassage"
          class="mt-3"
        >
          <PassageReader
            :tokens="current.passage.tokens"
            :body="current.passage.body"
            :readonly="true"
          />
        </div>
      </UCard>

      <div class="flex items-center gap-2 text-xs text-muted">
        <UBadge
          variant="outline"
          color="neutral"
          :label="current.level"
        />
        <span>{{ qtypeLabel(current.qtype) }}</span>
        <span
          v-if="current.bucket === 'review' || current.bucket === 'mistake'"
          class="rounded bg-elevated px-1.5 py-0.5"
        >{{ current.bucket === 'review' ? '複習' : '錯題' }}</span>
        <span
          v-else-if="current.bucket === 'todayNew' || current.bucket === 'learn'"
          class="rounded bg-primary/10 px-1.5 py-0.5 text-primary"
        >今天學的</span>
      </div>

      <QuestionStem
        :stem="current.stem"
        :size="current.qtype === 'usage' ? 'lg' : 'md'"
      />

      <!-- options -->
      <div class="grid gap-2">
        <button
          v-for="(opt, i) in current.options"
          :key="i"
          type="button"
          class="ja flex min-h-12 w-full items-start gap-3 rounded-lg border px-4 py-3.5 text-left text-lg touch-manipulation"
          :class="[
            chosen == null ? 'border-default [@media(hover:hover)]:hover:border-primary/60 [@media(hover:hover)]:hover:bg-elevated/50' : 'cursor-default',
            chosen != null && result && i === result.answerIndex ? 'border-success bg-success/10 feedback-correct' : '',
            chosen != null && result && i === chosen && i !== result.answerIndex ? 'border-error bg-error/10 feedback-wrong' : '',
            chosen != null && result && i !== chosen && i !== result.answerIndex ? 'border-default opacity-50' : '',
            chosen != null && !result && i === chosen ? 'border-primary bg-primary/10' : '',
            chosen != null && !result && i !== chosen ? 'border-default opacity-50' : ''
          ]"
          :disabled="chosen != null || submitting"
          @click="choose(i)"
        >
          <span class="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded border border-default text-xs font-medium text-muted">{{ letters[i] }}</span>
          <span class="flex-1">{{ opt }}</span>
          <UIcon
            v-if="submitting && !result && i === chosen"
            name="i-lucide-loader-circle"
            class="mt-1 size-5 shrink-0 animate-spin text-primary"
          />
          <UIcon
            v-else-if="chosen != null && result && i === result.answerIndex"
            name="i-lucide-check"
            class="mt-1 size-5 text-success"
          />
          <UIcon
            v-else-if="chosen != null && result && i === chosen"
            name="i-lucide-x"
            class="mt-1 size-5 text-error"
          />
        </button>
      </div>

      <!-- feedback -->
      <div
        v-if="result && !isMock"
        class="space-y-4"
      >
        <div class="flex items-center justify-between">
          <div
            class="text-lg font-semibold"
            :class="result.isCorrect ? 'text-success' : 'text-error'"
          >
            {{ result.isCorrect ? '正確' : '錯了' }}
            <span class="ml-2 text-sm font-normal text-muted">+{{ result.xpGained }} XP</span>
          </div>
          <div
            v-if="result.knowledgePoints.length"
            class="flex flex-wrap justify-end gap-1"
          >
            <NuxtLink
              v-for="k in result.knowledgePoints"
              :key="k.id"
              :to="`/knowledge/${k.id}`"
              class="ja rounded border border-default px-2 py-0.5 text-xs hover:bg-elevated"
            >
              {{ k.term }} <span class="text-muted">{{ k.mastery }}%</span>
            </NuxtLink>
          </div>
        </div>
        <UCard>
          <ExplanationPanel
            :explanation="result.explanation"
            :options="current.options"
            :answer-index="result.answerIndex"
            :chosen-index="chosen"
            :extra="result.extraExplanations"
            :question-id="current.id"
          />
        </UCard>
        <div class="sticky bottom-3 flex justify-end">
          <UButton
            size="lg"
            :label="index === questions.length - 1 ? '完成' : '下一題'"
            trailing-icon="i-lucide-arrow-right"
            @click="next"
          />
        </div>
      </div>

      <!-- mock navigation -->
      <div
        v-else-if="isMock"
        class="flex items-center justify-between pt-2"
      >
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-left"
          label="上一題"
          :disabled="index === 0"
          @click="prev"
        />
        <UButton
          v-if="chosen != null"
          :label="index === questions.length - 1 ? '交卷' : '下一題'"
          trailing-icon="i-lucide-arrow-right"
          @click="next"
        />
        <UButton
          v-else-if="index === questions.length - 1"
          label="交卷"
          color="neutral"
          variant="soft"
          @click="finish"
        />
      </div>

      <p
        v-if="chosen == null"
        class="hidden text-center text-xs text-muted md:block"
      >
        鍵盤 1–4 選答案，Enter 下一題
      </p>
    </div>

    <UCard v-else>
      <p class="text-muted">這個練習沒有題目。</p>
      <UButton
        class="mt-3"
        to="/"
        label="回今日"
      />
    </UCard>
  </div>
</template>

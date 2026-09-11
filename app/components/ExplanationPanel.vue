<script setup lang="ts">
import type { Explanation, OptionNote } from '~~/shared/types'

const props = defineProps<{
  explanation: Explanation
  options: string[]
  answerIndex: number
  chosenIndex: number | null
  extra?: Explanation[]
  questionId: string
  compact?: boolean
}>()

const letters = ['A', 'B', 'C', 'D', 'E', 'F']
const toastError = useToastError()
const asking = ref(false)
const localExtra = ref<Explanation[]>([...(props.extra ?? [])])
watch(() => props.extra, v => { localExtra.value = [...(v ?? [])] })

function noteAt(i: number): OptionNote | undefined {
  return props.explanation.optionNotes?.[i]
}

function noteHasContent(n: OptionNote | undefined) {
  return Boolean(n?.reading || n?.meaningZh || n?.pos || n?.usage || n?.example)
}

const showWrong = computed(() =>
  props.explanation.whyWrong?.some(Boolean)
  || props.explanation.optionNotes?.some((n, i) => i !== props.answerIndex && noteHasContent(n))
)

async function explainAgain() {
  asking.value = true
  try {
    const res = await $fetch<{ explanation: Explanation }>(`/api/questions/${props.questionId}/explain`, { method: 'POST' })
    localExtra.value.push(res.explanation)
  } catch (e) {
    toastError(e, '無法產生新的解釋（可能沒有設定 OpenAI 金鑰）')
  } finally {
    asking.value = false
  }
}

const flagged = ref(false)
async function flag() {
  try {
    await $fetch(`/api/questions/${props.questionId}/flag`, { method: 'POST', body: {} })
    flagged.value = true
  } catch (e) {
    toastError(e)
  }
}
</script>

<template>
  <div class="space-y-4 text-[15px] leading-relaxed">
    <!-- stem meaning -->
    <section v-if="explanation.stemMeaning?.ja && explanation.stemMeaning?.zh">
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">這句話的意思</div>
      <div class="ja">{{ explanation.stemMeaning.ja }}</div>
      <div class="text-sm text-muted">{{ explanation.stemMeaning.zh }}</div>
    </section>

    <!-- why correct -->
    <section>
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">為什麼選 {{ letters[answerIndex] }}</div>
      <p>{{ explanation.whyCorrect }}</p>
    </section>

    <!-- why wrong -->
    <section v-if="showWrong">
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">其他選項哪裡錯</div>
      <ul class="space-y-3">
        <li
          v-for="(_, i) in options"
          :key="i"
          v-show="i !== answerIndex && (Boolean(explanation.whyWrong?.[i]) || noteHasContent(noteAt(i)))"
        >
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span
              class="ja font-medium"
              :class="i === chosenIndex ? 'text-error' : ''"
            >{{ letters[i] }}. {{ options[i] }}</span>
            <span
              v-if="noteAt(i)?.reading"
              class="ja text-sm text-muted"
            >（{{ noteAt(i)?.reading }}）</span>
          </div>
          <p v-if="noteAt(i)?.meaningZh">{{ noteAt(i)?.meaningZh }}</p>
          <p
            v-if="noteAt(i)?.pos"
            class="text-sm text-muted"
          >
            {{ noteAt(i)?.pos }}
          </p>
          <p
            v-if="noteAt(i)?.usage && noteAt(i)?.usage !== noteAt(i)?.pos"
            class="text-sm text-muted"
          >
            {{ noteAt(i)?.usage }}
          </p>
          <div
            v-if="noteAt(i)?.example"
            class="mt-0.5 text-sm"
          >
            <div class="ja">{{ noteAt(i)?.example?.ja }}</div>
            <div
              v-if="noteAt(i)?.example?.zh"
              class="text-muted"
            >
              {{ noteAt(i)?.example?.zh }}
            </div>
          </div>
          <p
            v-if="explanation.whyWrong?.[i]"
            class="mt-0.5 text-sm text-muted"
          >
            {{ explanation.whyWrong[i] }}
          </p>
        </li>
      </ul>
    </section>

    <!-- core -->
    <section
      v-if="explanation.coreConcept"
      class="rounded-md bg-elevated/60 p-3"
    >
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">核心</div>
      <p>{{ explanation.coreConcept }}</p>
      <p
        v-if="explanation.memoryTip"
        class="mt-1 text-sm text-muted"
      >
        記法：{{ explanation.memoryTip }}
      </p>
    </section>

    <!-- examples -->
    <section v-if="explanation.examples?.length && !compact">
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">例句</div>
      <ul class="space-y-2">
        <li
          v-for="(ex, i) in explanation.examples"
          :key="i"
        >
          <div class="ja">{{ ex.ja }}</div>
          <div class="text-sm text-muted">{{ ex.zh }}</div>
        </li>
      </ul>
    </section>

    <!-- confusables -->
    <section v-if="explanation.confusables?.length">
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">容易搞混</div>
      <ul class="space-y-1">
        <li
          v-for="(c, i) in explanation.confusables"
          :key="i"
        >
          <span class="ja font-medium">{{ c.term }}</span>
          <span class="text-muted"> — {{ c.diff }}</span>
        </li>
      </ul>
    </section>

    <!-- extra explanations -->
    <section
      v-for="(ex, n) in localExtra"
      :key="n"
      class="rounded-md border border-default p-3"
    >
      <div class="mb-2 text-xs font-medium uppercase tracking-wide text-primary">換個角度說 {{ n + 1 }}</div>
      <p>{{ ex.whyCorrect }}</p>
      <ul
        v-if="ex.whyWrong?.some(Boolean)"
        class="mt-2 space-y-1 text-sm"
      >
        <li
          v-for="(w, i) in ex.whyWrong"
          :key="i"
          v-show="i !== answerIndex && w"
        >
          <span class="ja font-medium">{{ letters[i] }}.</span> {{ w }}
        </li>
      </ul>
      <p
        v-if="ex.coreConcept"
        class="mt-2 text-sm"
      >
        {{ ex.coreConcept }}
      </p>
      <ul
        v-if="ex.examples?.length"
        class="mt-2 space-y-1 text-sm"
      >
        <li
          v-for="(e, i) in ex.examples"
          :key="i"
        >
          <span class="ja">{{ e.ja }}</span> <span class="text-muted">{{ e.zh }}</span>
        </li>
      </ul>
    </section>

    <div class="flex flex-wrap gap-2 pt-1">
      <UButton
        size="xs"
        variant="soft"
        color="neutral"
        icon="i-lucide-message-circle-question"
        label="我還是不懂"
        :loading="asking"
        @click="explainAgain"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :icon="flagged ? 'i-lucide-flag-off' : 'i-lucide-flag'"
        :label="flagged ? '已回報' : '題目有問題'"
        :disabled="flagged"
        @click="flag"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Explanation } from '~~/shared/types'

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
    <!-- why correct -->
    <section>
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">為什麼選 {{ letters[answerIndex] }}</div>
      <p>{{ explanation.whyCorrect }}</p>
    </section>

    <!-- why wrong -->
    <section v-if="explanation.whyWrong?.some(Boolean)">
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">其他選項哪裡錯</div>
      <ul class="space-y-1.5">
        <li
          v-for="(w, i) in explanation.whyWrong"
          :key="i"
          v-show="i !== answerIndex && w"
          class="flex gap-2"
          :class="i === chosenIndex ? 'text-error' : ''"
        >
          <span class="ja shrink-0 font-medium">{{ letters[i] }}. {{ options[i] }}</span>
          <span class="text-muted">—</span>
          <span>{{ w }}</span>
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

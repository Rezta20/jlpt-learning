<script setup lang="ts">
import type { PassageToken } from '~~/shared/types'

const props = defineProps<{
  title?: string | null
  tokens: PassageToken[]
  body: string
  /** words already in the knowledge base: term → { id, learned } */
  kpByTerm?: Record<string, { id: string, learned: boolean }>
  unknown?: string[]
  showFurigana?: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'mark-unknown', surface: string): void
  (e: 'add-word', token: PassageToken): void
}>()

const active = ref<number | null>(null)
const isPunct = (s: string) => /^[\s\p{P}\p{S}]+$/u.test(s)
const isTappable = (t: PassageToken) => !isPunct(t.s) && (t.r || t.m)

function tap(i: number) {
  const t = props.tokens[i]
  if (!t || !isTappable(t)) return
  active.value = active.value === i ? null : i
}

const activeToken = computed(() => (active.value == null ? null : props.tokens[active.value] ?? null))
const activeKp = computed(() => (activeToken.value ? props.kpByTerm?.[activeToken.value.s] : undefined))
const isUnknown = (s: string) => props.unknown?.includes(s)
</script>

<template>
  <div>
    <h2
      v-if="title"
      class="ja mb-3 text-lg font-semibold"
    >
      {{ title }}
    </h2>
    <div
      v-if="tokens.length"
      class="ja text-[19px] leading-[2.1]"
    >
      <template
        v-for="(t, i) in tokens"
        :key="i"
      >
        <br v-if="t.s === '\n'">
        <span
          v-else
          class="tok"
          :class="[
            isTappable(t) && !readonly ? 'cursor-pointer' : '',
            isTappable(t) && readonly ? 'cursor-pointer' : '',
            active === i ? 'bg-primary/15 ring-1 ring-primary/40' : '',
            isUnknown(t.s) ? 'is-unknown' : '',
            t.t ? 'is-target' : ''
          ]"
          @click="tap(i)"
        >
          <ruby v-if="showFurigana && t.r && t.r !== t.s">{{ t.s }}<rt class="text-[10px] text-muted">{{ t.r }}</rt></ruby>
          <template v-else>{{ t.s }}</template>
        </span>
      </template>
    </div>
    <p
      v-else
      class="ja whitespace-pre-wrap text-[19px] leading-[2]"
    >
      {{ body }}
    </p>

    <!-- token panel -->
    <Transition name="fade">
      <div
        v-if="activeToken"
        class="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-4 rounded-lg border border-default bg-default p-3 shadow-lg md:bottom-2"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="flex items-baseline gap-2">
              <span class="ja text-2xl font-semibold">{{ activeToken.s }}</span>
              <span
                v-if="activeToken.r && activeToken.r !== activeToken.s"
                class="ja text-muted"
              >{{ activeToken.r }}</span>
            </div>
            <div class="mt-1">{{ activeToken.m || '（無釋義）' }}</div>
          </div>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="active = null"
          />
        </div>
        <div
          v-if="!readonly"
          class="mt-3 flex flex-wrap gap-2"
        >
          <UButton
            size="xs"
            :variant="isUnknown(activeToken.s) ? 'solid' : 'soft'"
            color="neutral"
            icon="i-lucide-help-circle"
            :label="isUnknown(activeToken.s) ? '已標記不會' : '標記不會'"
            @click="emit('mark-unknown', activeToken.s)"
          />
          <UButton
            v-if="activeKp?.learned"
            size="xs"
            variant="soft"
            color="success"
            icon="i-lucide-check"
            label="已在複習排程"
            :to="`/knowledge/${activeKp.id}`"
          />
          <UButton
            v-else
            size="xs"
            variant="soft"
            icon="i-lucide-plus"
            label="加入單字複習"
            @click="emit('add-word', activeToken)"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

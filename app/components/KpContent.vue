<script setup lang="ts">
import type { KnowledgePointDto } from '~~/shared/types'
import { displayMeaning, englishGloss, posTags } from '~~/shared/vocab-display'

const props = defineProps<{ kp: KnowledgePointDto, compact?: boolean }>()

const BOOK_SHORT: Record<string, string> = {
  '大家學標準日本語 初級本': '初級本',
  '大家學標準日本語 中級本': '中級本',
  '大家學標準日本語 高級本': '高級本',
  '大家學標準日本語：日語結構解密': '結構解密'
}
const refs = computed(() => (props.kp.bookRefs ?? []).map(r => `${BOOK_SHORT[r.book] ?? r.book}${r.lesson ? ` 第${r.lesson}課` : ''}${r.page ? ` p.${r.page}` : ''}`))
const ytSearch = computed(() => `https://www.youtube.com/results?search_query=${encodeURIComponent(`出口仁 ${props.kp.term.replace(/[〜～（）()／・]/g, ' ').trim()}`)}`)
</script>

<template>
  <div class="space-y-4">
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="ja text-2xl font-semibold">{{ kp.term }}</h2>
        <span
          v-if="kp.reading && kp.reading !== kp.term"
          class="ja text-muted"
        >{{ kp.reading }}</span>
        <UBadge
          variant="outline"
          color="neutral"
          :label="kp.level"
        />
        <span
          v-for="tag in posTags(kp.pos)"
          :key="tag"
          class="text-xs text-muted"
        >{{ tag }}</span>
      </div>
      <p class="mt-1 text-lg">{{ displayMeaning(kp) || englishGloss(kp) || kp.content?.coreMeaning || kp.meaningZh }}</p>
    </div>

    <dl
      v-if="kp.content?.connection || kp.content?.usageScene || kp.content?.nuance"
      class="grid gap-3 text-[15px] sm:grid-cols-[6rem_1fr]"
    >
      <template v-if="kp.content.connection">
        <dt class="text-sm text-muted">接續</dt>
        <dd class="ja">{{ kp.content.connection }}</dd>
      </template>
      <template v-if="kp.content.usageScene">
        <dt class="text-sm text-muted">什麼時候用</dt>
        <dd>{{ kp.content.usageScene }}</dd>
      </template>
      <template v-if="kp.content.nuance">
        <dt class="text-sm text-muted">語感</dt>
        <dd>{{ kp.content.nuance }}</dd>
      </template>
    </dl>

    <section v-if="kp.content?.examples?.length">
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">例句</div>
      <ol class="space-y-2">
        <li
          v-for="(ex, i) in (compact ? kp.content.examples.slice(0, 3) : kp.content.examples)"
          :key="i"
        >
          <div class="ja text-[17px]">{{ ex.ja }}</div>
          <div class="text-sm text-muted">{{ ex.zh }}</div>
        </li>
      </ol>
    </section>

    <section v-if="kp.content?.confusables?.length">
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">容易搞混</div>
      <ul class="space-y-1 text-[15px]">
        <li
          v-for="(c, i) in kp.content.confusables"
          :key="i"
        >
          <span class="ja font-medium">{{ c.term }}</span>
          <span class="text-muted"> — {{ c.diff }}</span>
        </li>
      </ul>
    </section>

    <p
      v-if="kp.content?.memo"
      class="rounded-md bg-elevated/60 p-3 text-[15px]"
    >
      {{ kp.content.memo }}
    </p>

    <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span
        v-for="r in refs"
        :key="r"
        class="rounded border border-default px-1.5 py-0.5"
      >{{ r }}</span>
      <a
        v-if="kp.videoUrl"
        :href="kp.videoUrl"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-1 text-primary hover:underline"
      ><UIcon name="i-lucide-youtube" />出口仁老師影片</a>
      <a
        v-else-if="kp.type === 'grammar'"
        :href="ytSearch"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-1 hover:underline"
      ><UIcon name="i-lucide-youtube" />搜尋出口仁影片</a>
    </div>

    <p
      v-if="!kp.contentReady"
      class="text-xs text-muted"
    >
      詳細解說尚未生成（後台 → 生成文法解說）。
    </p>
  </div>
</template>

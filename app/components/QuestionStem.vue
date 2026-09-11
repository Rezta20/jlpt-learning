<script setup lang="ts">
/**
 * Renders a JLPT-style stem:
 *  - （　　） / (　) blanks → dashed underline box
 *  - 【word】 → underlined target word
 *  - ★ → highlighted star slot (sentence order)
 */
const props = defineProps<{ stem: string, size?: 'md' | 'lg' }>()

type Part = { t: 'text' | 'blank' | 'mark' | 'star' | 'slot', v: string }

const parts = computed<Part[]>(() => {
  const out: Part[] = []
  const re = /(（\s*）|\(\s*\)|【[^】]*】|★|＿{2,}|_{2,})/g
  let last = 0
  for (const m of props.stem.matchAll(re)) {
    const idx = m.index ?? 0
    if (idx > last) out.push({ t: 'text', v: props.stem.slice(last, idx) })
    const tok = m[0]
    if (tok.startsWith('【')) out.push({ t: 'mark', v: tok.slice(1, -1) })
    else if (tok === '★') out.push({ t: 'star', v: '★' })
    else if (/^[＿_]+$/.test(tok)) out.push({ t: 'slot', v: '' })
    else out.push({ t: 'blank', v: '' })
    last = idx + tok.length
  }
  if (last < props.stem.length) out.push({ t: 'text', v: props.stem.slice(last) })
  return out
})
</script>

<template>
  <p
    class="ja-stem whitespace-pre-wrap break-words"
    :class="size === 'lg' ? 'text-2xl' : ''"
  >
    <template
      v-for="(p, i) in parts"
      :key="i"
    >
      <span v-if="p.t === 'text'">{{ p.v }}</span>
      <span
        v-else-if="p.t === 'blank'"
        class="blank mx-0.5"
      >　　</span>
      <span
        v-else-if="p.t === 'slot'"
        class="blank mx-0.5"
      >　　</span>
      <span
        v-else-if="p.t === 'mark'"
        class="underline decoration-2 underline-offset-4 decoration-primary"
      >{{ p.v }}</span>
      <span
        v-else
        class="mx-0.5 inline-flex min-w-14 items-center justify-center rounded border-2 border-primary/60 bg-primary/10 px-1 text-primary"
      >★</span>
    </template>
  </p>
</template>

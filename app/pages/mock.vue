<script setup lang="ts">
useHead({ title: '模考' })
const toastError = useToastError()
const level = ref<'N5' | 'N4' | 'N3'>('N3')
const starting = ref<string | null>(null)

const sections = [
  { key: 'language', label: '言語知識（文字・語彙・文法）', desc: '30 題 · 25 分', icon: 'i-lucide-type' },
  { key: 'reading', label: '読解', desc: '約 9 題 · 25 分', icon: 'i-lucide-book-open-text' },
  { key: 'listening', label: '聴解', desc: '10 題 · 15 分（需先生成聽力題）', icon: 'i-lucide-headphones' },
  { key: 'full', label: '完整模考', desc: '三科合併 · 約 65 分', icon: 'i-lucide-timer' }
]

async function start(section: string) {
  starting.value = section
  try {
    const res = await $fetch<{ id: string }>('/api/sessions', { method: 'POST', body: { mode: 'mock', section, level: level.value } })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-semibold tracking-tight">模考</h1>
    <p class="text-sm text-muted">計時、作答中不顯示答案與解釋，交卷後估算各科分數（0–60）。建議每 3 週做一次，檢查點：10/25 語言知識、11/15 完整模考。</p>

    <div class="flex gap-2">
      <UButton
        v-for="l in ['N5', 'N4', 'N3']"
        :key="l"
        :label="l"
        size="sm"
        :variant="level === l ? 'solid' : 'outline'"
        :color="level === l ? 'primary' : 'neutral'"
        @click="level = l as any"
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <UCard
        v-for="s in sections"
        :key="s.key"
        :ui="{ body: 'p-4' }"
      >
        <div class="flex items-start gap-3">
          <UIcon
            :name="s.icon"
            class="mt-0.5 size-5 text-primary"
          />
          <div class="flex-1">
            <div class="font-medium">{{ s.label }}</div>
            <div class="text-sm text-muted">{{ s.desc }}</div>
          </div>
        </div>
        <UButton
          class="mt-3"
          size="sm"
          label="開始"
          :loading="starting === s.key"
          @click="start(s.key)"
        />
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Level, Skill } from '~~/shared/types'
import { LEVELS, SKILL_LABEL, QTYPES_BY_SKILL, QTYPE_LABEL } from '~~/shared/types'

useHead({ title: '練習' })
const toastError = useToastError()

const saved = useLocalStorage('quick-config', {
  skills: ['vocab', 'grammar'] as Skill[],
  levels: [] as Level[],
  autoLevel: true,
  mix: true,
  count: 20,
  qtypes: [] as string[]
})

const starting = ref<string | null>(null)
const skillOptions = (Object.keys(SKILL_LABEL) as Skill[]).map(s => ({ value: s, label: SKILL_LABEL[s] }))
const availableQtypes = computed(() => saved.value.skills.flatMap(s => QTYPES_BY_SKILL[s] ?? []).filter(t => !t.startsWith('listening')))

function toggle<T>(arr: T[], v: T) {
  const i = arr.indexOf(v)
  if (i === -1) arr.push(v)
  else arr.splice(i, 1)
}

async function start(body: Record<string, unknown>, key = 'quick') {
  starting.value = key
  try {
    const res = await $fetch<{ id: string }>('/api/sessions', { method: 'POST', body })
    await navigateTo(`/practice/${res.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    starting.value = null
  }
}

function startQuick() {
  if (!saved.value.skills.length) return
  start({
    mode: 'quick',
    skills: saved.value.skills,
    levels: saved.value.levels,
    autoLevel: saved.value.autoLevel || saved.value.levels.length === 0,
    mix: saved.value.mix,
    count: saved.value.count,
    qtypes: saved.value.qtypes.length ? saved.value.qtypes : undefined
  })
}
</script>

<template>
  <div class="space-y-5">
    <h1 class="text-2xl font-semibold tracking-tight">練習</h1>

    <div class="grid gap-3 sm:grid-cols-3">
      <UCard
        :ui="{ body: 'p-4' }"
        class="cursor-pointer hover:ring-primary/50"
        @click="start({ mode: 'mistakes', count: 20 }, 'mistakes')"
      >
        <div class="flex items-center gap-2 font-medium">
          <UIcon
            name="i-lucide-undo-2"
            class="size-5 text-primary"
          />錯題重做
        </div>
        <p class="mt-1 text-sm text-muted">最近答錯、還沒答對回來的題目</p>
      </UCard>
      <UCard
        :ui="{ body: 'p-4' }"
        class="cursor-pointer hover:ring-primary/50"
        @click="start({ mode: 'weak', count: 20 }, 'weak')"
      >
        <div class="flex items-center gap-2 font-medium">
          <UIcon
            name="i-lucide-target"
            class="size-5 text-primary"
          />弱點加強
        </div>
        <p class="mt-1 text-sm text-muted">熟練度最低的 12 個知識點</p>
      </UCard>
      <UCard
        :ui="{ body: 'p-4' }"
        class="cursor-pointer hover:ring-primary/50"
        @click="navigateTo('/mock')"
      >
        <div class="flex items-center gap-2 font-medium">
          <UIcon
            name="i-lucide-timer"
            class="size-5 text-primary"
          />模考
        </div>
        <p class="mt-1 text-sm text-muted">計時、不即時看答案、估算分數</p>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <div class="font-medium">自訂快速練習</div>
      </template>
      <div class="space-y-5">
        <div>
          <div class="mb-2 text-sm text-muted">範圍</div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="s in skillOptions.filter(o => o.value !== 'listening')"
              :key="s.value"
              :label="s.label"
              size="sm"
              :variant="saved.skills.includes(s.value) ? 'solid' : 'outline'"
              :color="saved.skills.includes(s.value) ? 'primary' : 'neutral'"
              @click="toggle(saved.skills, s.value)"
            />
          </div>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between text-sm">
            <span class="text-muted">等級</span>
            <USwitch
              v-model="saved.autoLevel"
              label="自動（依我目前程度 + 一級）"
              size="md"
            />
          </div>
          <div
            v-if="!saved.autoLevel"
            class="flex flex-wrap gap-2"
          >
            <UButton
              v-for="l in LEVELS.slice(0, 3)"
              :key="l"
              :label="l"
              size="sm"
              :variant="saved.levels.includes(l) ? 'solid' : 'outline'"
              :color="saved.levels.includes(l) ? 'primary' : 'neutral'"
              @click="toggle(saved.levels, l)"
            />
          </div>
        </div>

        <div>
          <div class="mb-2 text-sm text-muted">題數</div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="n in [10, 20, 30, 50]"
              :key="n"
              :label="`${n}`"
              size="sm"
              :variant="saved.count === n ? 'solid' : 'outline'"
              :color="saved.count === n ? 'primary' : 'neutral'"
              @click="saved.count = n"
            />
          </div>
        </div>

        <div>
          <USwitch
            v-model="saved.mix"
            label="混合複習與錯題（關閉＝只出新題）"
            size="md"
          />
        </div>

        <UCollapsible>
          <UButton
            variant="link"
            color="neutral"
            size="xs"
            label="限定題型（進階）"
            trailing-icon="i-lucide-chevron-down"
          />
          <template #content>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton
                v-for="t in availableQtypes"
                :key="t"
                :label="QTYPE_LABEL[t]"
                size="xs"
                :variant="saved.qtypes.includes(t) ? 'solid' : 'outline'"
                :color="saved.qtypes.includes(t) ? 'primary' : 'neutral'"
                @click="toggle(saved.qtypes, t)"
              />
            </div>
          </template>
        </UCollapsible>

        <UButton
          size="lg"
          block
          label="開始"
          icon="i-lucide-play"
          :loading="starting === 'quick'"
          :disabled="!saved.skills.length"
          @click="startQuick"
        />
      </div>
    </UCard>
  </div>
</template>

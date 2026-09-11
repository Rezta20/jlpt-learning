<script setup lang="ts">
const route = useRoute()
const { clear } = useUserSession()

const nav = [
  { label: '今日', icon: 'i-lucide-sun', to: '/' },
  { label: '練習', icon: 'i-lucide-pencil-line', to: '/practice' },
  { label: '知識點', icon: 'i-lucide-book-open', to: '/knowledge' },
  { label: '閱讀', icon: 'i-lucide-newspaper', to: '/reading' },
  { label: '儀表板', icon: 'i-lucide-chart-no-axes-column', to: '/dashboard' }
]

const more = [
  [
    { label: '學習路線', icon: 'i-lucide-route', to: '/plan' },
    { label: '錯題本', icon: 'i-lucide-list-x', to: '/mistakes' },
    { label: '模考', icon: 'i-lucide-timer', to: '/mock' },
    { label: '貼文字匿入', icon: 'i-lucide-clipboard-paste', to: '/import' }
  ],
  [
    { label: '後台', icon: 'i-lucide-settings-2', to: '/admin' },
    { label: '登出', icon: 'i-lucide-log-out', onSelect: async () => {
      await $fetch('/api/auth/logout', { method: 'POST' })
      await clear()
      await navigateTo('/login')
    } }
  ]
]

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  return route.path.startsWith(to)
}
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <header class="sticky top-0 z-30 border-b border-default bg-default md:bg-default/90 md:backdrop-blur">
      <div class="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4">
        <NuxtLink
          to="/"
          class="flex min-h-11 items-center gap-2 font-semibold tracking-tight"
        >
          <span class="inline-flex size-9 items-center justify-center rounded-md bg-primary text-inverted text-sm font-bold">N3</span>
          <span class="hidden sm:inline">JLPT Trainer</span>
        </NuxtLink>

        <nav class="hidden items-center gap-1 md:flex">
          <UButton
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            :label="item.label"
            :icon="item.icon"
            size="sm"
            :variant="isActive(item.to) ? 'soft' : 'ghost'"
            :color="isActive(item.to) ? 'primary' : 'neutral'"
          />
        </nav>

        <UDropdownMenu
          :items="more"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-menu"
            color="neutral"
            variant="ghost"
            size="md"
            class="max-md:size-11"
            aria-label="更多"
          />
        </UDropdownMenu>
      </div>
    </header>

    <main class="mx-auto w-full max-w-4xl flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 md:pb-10">
      <slot />
    </main>

    <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default pb-[env(safe-area-inset-bottom)] md:hidden">
      <div class="mx-auto grid max-w-4xl grid-cols-5">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex min-h-12 flex-col items-center justify-center gap-0.5 py-2 text-[11px] touch-manipulation"
          :class="isActive(item.to) ? 'text-primary' : 'text-muted'"
        >
          <UIcon
            :name="item.icon"
            class="size-5"
          />
          {{ item.label }}
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'focus' })
useHead({ title: '登入' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  const u = String(username.value ?? '').trim()
  const p = String(password.value ?? '').trim()
  if (!u || !p) return
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { username: u, password: p } })
    await refreshSession()
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await navigateTo(redirect)
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, statusMessage?: string }
    error.value = err.data?.statusMessage || err.statusMessage || '登入失敗'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[70dvh] items-center justify-center">
    <UCard class="w-full max-w-sm">
      <div class="mb-6 flex items-center gap-3">
        <span class="inline-flex size-9 items-center justify-center rounded-md bg-primary text-inverted font-bold">N3</span>
        <div>
          <h1 class="text-lg font-semibold">JLPT Trainer</h1>
          <p class="text-sm text-muted">12/6 合格</p>
        </div>
      </div>
      <form
        class="space-y-4"
        @submit.prevent="submit"
      >
        <UFormField label="帳號">
          <UInput
            v-model="username"
            autocomplete="username"
            autofocus
            class="w-full"
            size="lg"
          />
        </UFormField>
        <UFormField label="密碼">
          <UInput
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="w-full"
            size="lg"
          />
        </UFormField>
        <p
          v-if="error"
          class="text-sm text-error"
        >
          {{ error }}
        </p>
        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading"
          label="進入"
        />
      </form>
    </UCard>
  </div>
</template>

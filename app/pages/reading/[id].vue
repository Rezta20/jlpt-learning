<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { data, error } = await useFetch<any>(`/api/reading/${id}`)
if (error.value) throw createError({ statusCode: 404, statusMessage: '找不到文章' })
useHead({ title: data.value?.title || '閱讀' })
</script>

<template>
  <div class="space-y-4">
    <UButton
      variant="link"
      color="neutral"
      size="xs"
      icon="i-lucide-arrow-left"
      label="返回"
      @click="$router.back()"
    />
    <PassageSession
      v-if="data"
      :passage="data"
    />
  </div>
</template>

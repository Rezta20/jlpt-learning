<script setup lang="ts">
const config = useRuntimeConfig()
useHead({
  titleTemplate: t => (t ? `${t} · ${config.public.appName}` : config.public.appName)
})
</script>

<template>
  <UApp :toaster="{ position: 'top-center', duration: 2500 }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

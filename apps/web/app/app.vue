<script setup lang="ts">
import { en, lo } from '@nuxt/ui/locale'

const { locale } = useI18n()
const uiLocale = computed(() => (locale.value === 'lo' ? lo : en))

useHead({ htmlAttrs: { lang: locale } })
</script>

<template>
  <UApp :locale="uiLocale" :toaster="{ position: 'bottom-right', expand: true, duration: 4000 }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

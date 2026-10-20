<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const requestId = computed(() => {
  const data = props.error.data as { requestId?: string } | undefined
  return data?.requestId
})

function retry() {
  void clearError({ redirect: useRoute().fullPath })
}
</script>

<template>
  <UApp>
    <NuxtLayout>
      <PlatformErrorPage :status="error.statusCode ?? 500" :request-id="requestId" @retry="retry" />
    </NuxtLayout>
  </UApp>
</template>

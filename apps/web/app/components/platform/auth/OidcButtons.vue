<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { OidcProvider } from '../../../types/platform'

const props = defineProps<{ redirect: string }>()
const { t } = useI18n()
const config = useRuntimeConfig()
const clicked = ref<string | null>(null)

// A page restored from the back-forward cache keeps its state: clear the busy button.
useEventListener('pageshow', (event: PageTransitionEvent) => {
  if (event.persisted) clicked.value = null
})

// 404 when the app has no single sign-on module: no buttons, no error.
const { data } = useApiItem<OidcProvider[]>('oidc', '/auth/oidc/providers', {
  retry: false,
  staleTime: 60_000,
})
const providers = computed(() => data.value ?? [])

// Marking the button busy disables the link and drops its href in the same tick, which cancels the
// navigation the click started: wait until the browser has begun it.
const busy = (key: string) => setTimeout(() => (clicked.value = key), 0)

const href = (key: string) =>
  `${config.public.platform.apiBase}/auth/oidc/${key}/start?redirect=${encodeURIComponent(props.redirect)}`
</script>

<template>
  <div v-if="providers.length" class="oidc">
    <USeparator :label="t('oidc.or')" />
    <UButton
      v-for="p in providers"
      :key="p.key"
      :href="href(p.key)"
      external
      color="neutral"
      variant="outline"
      size="xl"
      block
      icon="i-lucide-key-round"
      :loading="clicked === p.key"
      :disabled="!!clicked && clicked !== p.key"
      @click="busy(p.key)"
    >
      {{ t('oidc.continueWith', { label: p.label }) }}
    </UButton>
  </div>
</template>

<style scoped>
.oidc {
  display: grid;
  gap: 12px;
  margin-top: 20px;
}
</style>

<script setup lang="ts">
definePageMeta({ layout: 'auth', auth: false, title: 'handoff.signedOut.title' })

const { t } = useI18n()
const { platform } = useRuntimeConfig().public
const portal = portalLoginUrl('/', platform.apiBase as string, platform.signInUrl as string)

useHead({ title: () => t('handoff.signedOut.title') })
</script>

<template>
  <PlatformAuthPanel
    :title="t('handoff.signedOut.title')"
    :subtitle="t('handoff.signedOut.text')"
    icon="i-lucide-log-out"
  >
    <UButton :to="portal" external size="xl" block icon="i-lucide-door-open">
      {{ t('handoff.signedOut.portal') }}
    </UButton>
    <template #alt>
      <ULink to="/auth/sign-in?local=1" class="text-dimmed">{{ t('handoff.signedOut.local') }}</ULink>
    </template>
  </PlatformAuthPanel>
</template>

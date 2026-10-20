<script setup lang="ts">
definePageMeta({ title: 'account.title' })

const { t } = useI18n()
const tab = useQueryParam('tab', 'profile')
const manifest = useManifest()

const tabs = computed(() => [
  { value: 'profile', label: t('account.tabs.profile'), icon: 'i-lucide-user' },
  { value: 'security', label: t('account.tabs.security'), icon: 'i-lucide-shield' },
  { value: 'sessions', label: t('account.tabs.sessions'), icon: 'i-lucide-monitor-smartphone' },
  ...(manifest.has('notifications')
    ? [{ value: 'notifications', label: t('account.tabs.notifications'), icon: 'i-lucide-bell' }]
    : []),
  ...(manifest.has('approval')
    ? [{ value: 'delegations', label: t('account.tabs.delegations'), icon: 'i-lucide-forward' }]
    : []),
])

useHead({ title: () => t('account.title') })
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <PlatformPageHeader :title="t('account.title')" :subtitle="t('account.subtitle')" />
    <UTabs v-model="tab" :items="tabs" :content="false" variant="link" class="mb-5" />
    <PlatformAccountProfile v-if="tab === 'profile'" />
    <PlatformAccountSecurity v-else-if="tab === 'security'" />
    <PlatformAccountSessions v-else-if="tab === 'sessions'" />
    <PlatformAccountNotifications v-else-if="tab === 'notifications' && manifest.has('notifications')" />
    <PlatformAccountDelegations v-else-if="tab === 'delegations' && manifest.has('approval')" />
    <PlatformAccountProfile v-else />
  </div>
</template>

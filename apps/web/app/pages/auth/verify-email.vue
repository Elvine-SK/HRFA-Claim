<script setup lang="ts">
definePageMeta({ layout: 'auth', auth: false, title: 'auth.verify.title' })

const { t } = useI18n()
const api = useApi()
const session = useSession()
const token = useLinkToken()
const state = ref<'working' | 'done' | 'invalid'>(token.value ? 'working' : 'invalid')
const resending = ref(false)
const resent = ref(false)

useHead({ title: () => t('auth.verify.title') })

onMounted(async () => {
  await session.ensure().catch(() => undefined)
  if (!token.value) return
  try {
    await api('/auth/email/verify', { method: 'POST', body: { token: token.value } })
    state.value = 'done'
    if (session.isAuthenticated.value) await session.loadMe().catch(() => undefined)
  } catch {
    state.value = 'invalid'
  }
})

async function resend() {
  resending.value = true
  try {
    await api('/auth/email/verify/resend', { method: 'POST' })
    resent.value = true
  } finally {
    resending.value = false
  }
}
</script>

<template>
  <PlatformAuthPanel
    v-if="state === 'working'"
    :title="t('auth.verify.working')"
    icon="i-lucide-loader-circle"
  />

  <PlatformAuthPanel
    v-else-if="state === 'done'"
    :title="t('auth.verify.doneTitle')"
    :subtitle="t('auth.verify.doneText')"
    icon="i-lucide-mail-check"
    tone="ok"
  >
    <UButton :to="session.isAuthenticated.value ? '/' : '/auth/sign-in'" size="xl" block>
      {{ session.isAuthenticated.value ? t('platform.actions.continue') : t('auth.signIn.submit') }}
    </UButton>
  </PlatformAuthPanel>

  <PlatformAuthPanel
    v-else
    :title="t('auth.link.invalidTitle')"
    :subtitle="t('auth.verify.invalidText')"
    icon="i-lucide-link-2-off"
    tone="bad"
  >
    <UAlert
      v-if="resent"
      color="success"
      variant="subtle"
      icon="i-lucide-mail-check"
      :description="t('auth.verify.resent')"
      class="mb-4"
    />
    <UButton
      v-if="session.isAuthenticated.value"
      size="xl"
      block
      :loading="resending"
      :disabled="resent"
      @click="resend"
    >
      {{ t('auth.verify.resend') }}
    </UButton>
    <UButton v-else to="/auth/sign-in" size="xl" block>{{ t('auth.signIn.submit') }}</UButton>
  </PlatformAuthPanel>
</template>

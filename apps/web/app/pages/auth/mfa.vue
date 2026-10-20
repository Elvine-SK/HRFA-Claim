<script setup lang="ts">
import type { MfaMethod, SessionInfo } from '@elvine-sk/platform-nuxt/utils'
import { useNow } from '@vueuse/core'

definePageMeta({ layout: 'auth', auth: 'mfa', title: 'auth.mfa.title' })

const { t } = useI18n()
const route = useRoute()
const api = useApi()
const session = useSession()
const signOut = useSignOut()
const errors = useFormErrors<'code'>()

const redirect = computed(() => safeRedirect(route.query.redirect))
const info = computed(() => session.session.value?.mfa ?? null)
const enrolling = computed(() => !!info.value?.enrollmentRequired)
const factors = computed(() =>
  (info.value?.methods ?? []).filter((m): m is 'totp' | 'email' => m !== 'recovery'),
)
const method = ref<MfaMethod>(factors.value[0] ?? 'totp')
const code = ref('')
const busy = ref(false)
const sentAt = ref<number | null>(null)
const now = useNow({ interval: 1000 })
const resendIn = computed(() =>
  sentAt.value ? Math.max(0, 30 - Math.floor((now.value.getTime() - sentAt.value) / 1000)) : 0,
)

useHead({ title: () => t(enrolling.value ? 'auth.enroll.title' : 'auth.mfa.title') })

const tabs = computed(() => [
  ...factors.value.map((m) => ({ value: m as MfaMethod, label: t(`auth.mfa.method.${m}`) })),
  { value: 'recovery' as MfaMethod, label: t('auth.mfa.method.recovery') },
])

async function sendEmail() {
  errors.clear()
  try {
    await api('/auth/mfa/email/send', { method: 'POST' })
    sentAt.value = Date.now()
  } catch (error) {
    errors.apply(error)
  }
}

watch(
  method,
  (m) => {
    code.value = ''
    errors.clear()
    if (m === 'email' && !sentAt.value && !enrolling.value) void sendEmail()
  },
  { immediate: true },
)

async function verify() {
  const value = method.value === 'recovery' ? code.value.trim() : code.value
  if (value.length < 6) {
    errors.fields.code = t('auth.errors.codeRequired')
    return
  }
  busy.value = true
  errors.clear()
  try {
    await session.verifyMfa(method.value, value)
    await navigateTo(redirect.value, { replace: true })
  } catch (error) {
    code.value = ''
    if (isApiError(error) && error.status === 429) errors.message.value = t('errors.rate_limited')
    else errors.apply(error, ['code'])
  } finally {
    busy.value = false
  }
}

async function enrolled(next: SessionInfo) {
  await session.settle(next)
  await navigateTo(redirect.value, { replace: true })
}
</script>

<template>
  <PlatformAuthPanel
    v-if="enrolling"
    :title="t('auth.enroll.title')"
    :subtitle="t('auth.enroll.subtitle')"
    icon="i-lucide-shield-plus"
  >
    <PlatformAuthMfaEnroll @done="enrolled" />
    <template #alt>
      <UButton variant="link" class="px-0" @click="signOut()">{{ t('auth.mfa.otherAccount') }}</UButton>
    </template>
  </PlatformAuthPanel>

  <PlatformAuthPanel
    v-else
    :title="t('auth.mfa.title')"
    icon="i-lucide-shield-check"
    :error="errors.message.value"
  >
    <template #subtitle>
      <i18n-t :keypath="`auth.mfa.subtitle.${method}`" tag="span" scope="global">
        <template #email>
          <b>{{ session.user.value?.email }}</b>
        </template>
      </i18n-t>
    </template>

    <PlatformSegmented
      v-if="tabs.length > 1"
      v-model="method"
      :options="tabs"
      :label="t('auth.mfa.methodLabel')"
      block
      class="mb-5"
    />

    <form class="grid gap-4" novalidate @submit.prevent="verify">
      <UFormField v-if="method !== 'recovery'" :label="t('auth.mfa.codeLabel')" :error="errors.fields.code">
        <PlatformAuthCodeInput
          :key="method"
          v-model="code"
          :label="t('auth.mfa.codeLabel')"
          :invalid="!!errors.fields.code"
          :disabled="busy"
          @complete="verify"
        />
      </UFormField>
      <UFormField
        v-else
        :label="t('auth.mfa.recoveryLabel')"
        :hint="t('auth.mfa.recoveryHint')"
        :error="errors.fields.code"
      >
        <UInput
          v-model="code"
          autocomplete="one-time-code"
          size="lg"
          class="w-full"
          autofocus
          :ui="{ base: 'font-mono tracking-wider' }"
          placeholder="xxxxx-xxxxx"
        />
      </UFormField>

      <p v-if="method === 'email'" class="text-[13px] text-[var(--app-muted)]">
        <UButton variant="link" size="sm" class="px-0" :disabled="resendIn > 0" @click="sendEmail">
          {{ resendIn > 0 ? t('auth.mfa.resendIn', { s: resendIn }) : t('auth.mfa.resend') }}
        </UButton>
      </p>

      <UButton type="submit" size="xl" block :loading="busy">{{ t('auth.mfa.submit') }}</UButton>
    </form>
    <template #alt>
      <UButton variant="link" class="px-0" @click="signOut()">{{ t('auth.mfa.otherAccount') }}</UButton>
    </template>
  </PlatformAuthPanel>
</template>

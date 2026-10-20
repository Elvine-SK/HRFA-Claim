<script setup lang="ts">
import type { CaptchaChallenge } from '@elvine-sk/platform-nuxt/utils'

definePageMeta({ layout: 'auth', auth: 'guest', title: 'auth.forgot.title' })

const { t } = useI18n()
const api = useApi()
const errors = useFormErrors<'email'>()
const email = ref('')
const busy = ref(false)
const sent = ref(false)
const captcha = ref<CaptchaChallenge | null>(null)
const captchaToken = ref<string | null>(null)
const captchaBox = ref<{ reset: () => void }>()

useHead({ title: () => t('auth.forgot.title') })

async function submit() {
  errors.clear()
  if (!email.value.trim()) {
    errors.fields.email = t('auth.errors.identifierRequired')
    return
  }
  if (captcha.value && !captchaToken.value) {
    errors.message.value = t('auth.captcha.prompt')
    return
  }
  busy.value = true
  try {
    const body = { email: email.value.trim(), ...(captchaToken.value ? { captcha: captchaToken.value } : {}) }
    await api('/auth/password/forgot', { method: 'POST', body })
    sent.value = true
  } catch (error) {
    const asked = captchaChallengeOf(error)
    captchaBox.value?.reset()
    if (asked) {
      captcha.value = asked
      errors.message.value = t(asked.invalid ? 'auth.captcha.failed' : 'auth.captcha.prompt')
    } else if (isApiError(error) && error.status === 429) errors.message.value = t('errors.rate_limited')
    else errors.apply(error, ['email'])
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PlatformAuthPanel
    v-if="sent"
    :title="t('auth.forgot.sentTitle')"
    icon="i-lucide-mail-check"
    tone="ok"
    :back="{ to: '/auth/sign-in', label: t('auth.backToSignIn') }"
  >
    <template #subtitle>
      <i18n-t keypath="auth.forgot.sentText" tag="span" scope="global">
        <template #email>
          <b>{{ email }}</b>
        </template>
      </i18n-t>
    </template>
    <UButton color="neutral" variant="outline" size="lg" block @click="sent = false">
      {{ t('auth.forgot.tryAgain') }}
    </UButton>
  </PlatformAuthPanel>

  <PlatformAuthPanel
    v-else
    :title="t('auth.forgot.title')"
    :subtitle="t('auth.forgot.subtitle')"
    :back="{ to: '/auth/sign-in', label: t('auth.backToSignIn') }"
    :error="errors.message.value"
  >
    <form class="grid gap-4" novalidate @submit.prevent="submit">
      <UFormField :label="t('auth.fields.identifier')" :error="errors.fields.email">
        <UInput
          v-model="email"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          size="lg"
          class="w-full"
          autofocus
          :placeholder="t('auth.fields.identifierPlaceholder')"
        />
      </UFormField>
      <PlatformAuthCaptcha v-if="captcha" ref="captchaBox" v-model="captchaToken" :challenge="captcha" />
      <UButton type="submit" size="xl" block :loading="busy">{{ t('auth.forgot.submit') }}</UButton>
    </form>
  </PlatformAuthPanel>
</template>

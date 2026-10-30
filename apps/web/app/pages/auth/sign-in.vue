<script setup lang="ts">
import type { CaptchaChallenge, SignInMode } from '@elvine-sk/platform-nuxt/utils'

definePageMeta({ layout: 'auth', auth: 'guest', title: 'auth.signIn.title' })

const { t, te } = useI18n()
const route = useRoute()
const session = useSession()
const errors = useFormErrors<'identifier' | 'password'>()

const identifier = ref('')
const password = ref('')
const remember = ref(true)
const busy = ref(false)
// Shown once the API asks for it (after failed sign-ins); the token is good for one try.
const captcha = ref<CaptchaChallenge | null>(null)
const captchaToken = ref<string | null>(null)
const captchaBox = ref<{ reset: () => void }>()
const expired = computed(() => route.query.expired === '1')
const redirect = computed(() => safeRedirect(route.query.redirect))

const ssoError = computed(() => {
  const code = typeof route.query.error === 'string' ? route.query.error : ''
  if (code === 'rate_limit.exceeded') return t('errors.rate_limited')
  for (const area of ['oidc', 'handoff']) {
    if (!code.startsWith(`${area}.`)) continue
    const key = `${area}.errors.${code.slice(area.length + 1)}`
    return te(key) ? t(key) : t(`${area}.errors.failed`)
  }
  return ''
})

// Handoff mode: people sign in at the host portal; the form stays for `?local=1` and for errors.
const { platform } = useRuntimeConfig().public
const portalLogin = handoffRedirect(
  platform.signInMode as SignInMode,
  route.query,
  platform.apiBase as string,
  platform.signInUrl as string,
)
if (portalLogin) window.location.replace(portalLogin)

useHead({ title: () => t('auth.signIn.title') })

const { data: setup } = useApiItem<{ open: boolean }>('auth', '/auth/setup', { staleTime: 60_000 })

async function submit() {
  errors.clear()
  if (!identifier.value.trim()) errors.fields.identifier = t('auth.errors.identifierRequired')
  if (!password.value) errors.fields.password = t('auth.errors.passwordRequired')
  if (errors.fields.identifier || errors.fields.password) return
  if (captcha.value && !captchaToken.value) {
    errors.message.value = t('auth.captcha.prompt')
    return
  }
  busy.value = true
  try {
    const info = await session.signIn({
      identifier: identifier.value.trim(),
      password: password.value,
      remember: remember.value,
      ...(captchaToken.value ? { captcha: captchaToken.value } : {}),
    })
    const query = route.query.redirect ? { redirect: redirect.value } : {}
    if (info.state === 'mfa_pending') await navigateTo({ path: '/auth/mfa', query })
    else if (info.state === 'password_change') await navigateTo({ path: '/auth/change-password', query })
    else await navigateTo(redirect.value, { replace: true })
  } catch (error) {
    const asked = captchaChallengeOf(error)
    if (asked) {
      // The password is kept: the API did not look at it.
      captcha.value = asked
      errors.message.value = t(asked.invalid ? 'auth.captcha.failed' : 'auth.captcha.prompt')
      captchaBox.value?.reset()
      return
    }
    password.value = ''
    captchaBox.value?.reset()
    if (isApiError(error) && error.code === 'auth.password_expired')
      errors.message.value = t('errors.auth_password_expired')
    else if (isApiError(error) && error.status === 401)
      errors.message.value = t('errors.auth_invalid_credentials')
    else if (isApiError(error) && error.status === 429) errors.message.value = t('errors.rate_limited')
    else errors.apply(error, ['identifier', 'password'])
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PlatformAuthPanel
    :title="t('auth.signIn.title')"
    :subtitle="t('auth.signIn.subtitle')"
    :error="errors.message.value || ssoError"
  >
    <UAlert
      v-if="expired && !errors.message.value"
      color="warning"
      variant="subtle"
      icon="i-lucide-clock-alert"
      :title="t('states.401.title')"
      :description="t('states.401.text')"
      class="mb-4"
    />
    <UAlert
      v-if="setup?.open"
      color="info"
      variant="subtle"
      icon="i-lucide-sparkles"
      :description="t('auth.signIn.setupOpen')"
      :actions="[
        { label: t('auth.setup.cta'), to: '/auth/setup', color: 'info', variant: 'outline', size: 'xs' },
      ]"
      class="mb-4"
    />
    <form class="auth-fields" novalidate @submit.prevent="submit">
      <UFormField :label="t('auth.fields.identifier')" :error="errors.fields.identifier" name="identifier">
        <UInput
          tabindex="1"
          v-model="identifier"
          name="identifier"
          type="text"
          inputmode="email"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          size="lg"
          class="w-full"
          autofocus
          :placeholder="t('auth.fields.identifierPlaceholder')"
        />
      </UFormField>
      <UFormField :label="t('auth.fields.password')" :error="errors.fields.password" name="password">
        <template #hint>
          <NuxtLink tabindex="0" to="/auth/forgot" class="lbl-link">{{ t('auth.signIn.forgot') }}</NuxtLink>
        </template>
        <PlatformAuthPasswordInput
          tabindex="1"
          id="password"
          v-model="password"
          :invalid="!!errors.fields.password"
        />
      </UFormField>
      <UCheckbox v-model="remember" :label="t('auth.signIn.remember')" />
      <PlatformAuthCaptcha v-if="captcha" ref="captchaBox" v-model="captchaToken" :challenge="captcha" />
      <UButton tabindex="1" type="submit" size="xl" block :loading="busy">{{
        t('auth.signIn.submit')
      }}</UButton>
    </form>
    <PlatformAuthOidcButtons :redirect="redirect" />
    <template #alt>{{ t('auth.signIn.noAccount') }}</template>
  </PlatformAuthPanel>
</template>

<style scoped>
.auth-fields {
  display: grid;
  gap: 16px;
}
.lbl-link {
  color: var(--app-accent);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
}
.lbl-link:hover {
  text-decoration: underline;
}
</style>

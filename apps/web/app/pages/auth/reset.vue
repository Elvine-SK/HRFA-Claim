<script setup lang="ts">
definePageMeta({ layout: 'auth', auth: false, title: 'auth.reset.title' })

const { t } = useI18n()
const api = useApi()
const token = useLinkToken()
const errors = useFormErrors<'password'>()
const password = ref('')
const fields = useTemplateRef('fields')
const submitted = ref(false)
const busy = ref(false)
const done = ref(false)
const invalidLink = ref(!token.value)

useHead({ title: () => t('auth.reset.title') })

async function submit() {
  submitted.value = true
  if (!fields.value?.valid) return
  busy.value = true
  errors.clear()
  try {
    await api('/auth/password/reset', {
      method: 'POST',
      body: { token: token.value, password: password.value },
    })
    done.value = true
  } catch (error) {
    if (isApiError(error) && error.code === 'auth.invalid_token') invalidLink.value = true
    else errors.apply(error, ['password'])
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PlatformAuthPanel
    v-if="invalidLink"
    :title="t('auth.link.invalidTitle')"
    :subtitle="t('auth.reset.invalidText')"
    icon="i-lucide-link-2-off"
    tone="bad"
  >
    <UButton to="/auth/forgot" size="xl" block>{{ t('auth.reset.requestNew') }}</UButton>
  </PlatformAuthPanel>

  <PlatformAuthPanel
    v-else-if="done"
    :title="t('auth.reset.doneTitle')"
    :subtitle="t('auth.reset.doneText')"
    icon="i-lucide-circle-check"
    tone="ok"
  >
    <UButton to="/auth/sign-in" size="xl" block>{{ t('auth.signIn.submit') }}</UButton>
  </PlatformAuthPanel>

  <PlatformAuthPanel
    v-else
    :title="t('auth.reset.title')"
    :subtitle="t('auth.reset.subtitle')"
    :error="errors.message.value"
  >
    <form class="grid gap-5" novalidate @submit.prevent="submit">
      <PlatformAuthNewPassword
        ref="fields"
        v-model="password"
        :error="errors.fields.password"
        :submitted="submitted"
      />
      <UButton type="submit" size="xl" block :loading="busy">{{ t('auth.reset.submit') }}</UButton>
    </form>
  </PlatformAuthPanel>
</template>

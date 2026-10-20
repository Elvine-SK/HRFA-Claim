<script setup lang="ts">
definePageMeta({ layout: 'auth', auth: 'password', title: 'auth.changePassword.title' })

const { t } = useI18n()
const route = useRoute()
const api = useApi()
const session = useSession()
const signOut = useSignOut()
const errors = useFormErrors<'currentPassword' | 'newPassword'>()

const current = ref('')
const password = ref('')
const fields = useTemplateRef('fields')
const submitted = ref(false)
const busy = ref(false)
const redirect = computed(() => safeRedirect(route.query.redirect))

useHead({ title: () => t('auth.changePassword.title') })

async function submit() {
  submitted.value = true
  errors.clear()
  if (!current.value) errors.fields.currentPassword = t('auth.errors.passwordRequired')
  if (errors.fields.currentPassword || !fields.value?.valid) return
  busy.value = true
  try {
    await api('/auth/password/change', {
      method: 'POST',
      body: { currentPassword: current.value, newPassword: password.value },
    })
    await session.refresh()
    await navigateTo(redirect.value, { replace: true })
  } catch (error) {
    if (isApiError(error) && error.status === 429) errors.message.value = t('errors.rate_limited')
    else errors.apply(error, ['currentPassword', 'newPassword'])
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PlatformAuthPanel
    :title="t('auth.changePassword.title')"
    :subtitle="t('auth.changePassword.subtitle')"
    icon="i-lucide-key-round"
    :error="errors.message.value"
  >
    <form class="grid gap-5" novalidate @submit.prevent="submit">
      <UFormField :label="t('auth.changePassword.temporary')" :error="errors.fields.currentPassword">
        <PlatformAuthPasswordInput
          id="temporary-password"
          v-model="current"
          name="current-password"
          :invalid="!!errors.fields.currentPassword"
          autofocus
        />
      </UFormField>
      <PlatformAuthNewPassword
        ref="fields"
        v-model="password"
        :email="session.user.value?.email"
        :name="session.user.value?.displayName"
        :error="errors.fields.newPassword"
        :submitted="submitted"
      />
      <UButton type="submit" size="xl" block :loading="busy">{{ t('auth.changePassword.submit') }}</UButton>
    </form>
    <template #alt>
      <UButton variant="link" class="px-0" @click="signOut()">{{ t('auth.mfa.otherAccount') }}</UButton>
    </template>
  </PlatformAuthPanel>
</template>

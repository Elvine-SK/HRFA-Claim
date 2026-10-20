<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'

definePageMeta({ layout: 'auth', auth: false, title: 'auth.invite.title' })

const { t } = useI18n()
const api = useApi()
const token = useLinkToken()
const errors = useFormErrors<'password' | 'displayName'>()
const invite = ref<{ email: string; displayName: string } | null>(null)
const displayName = ref('')
const password = ref('')
const fields = useTemplateRef('fields')
const state = ref<'loading' | 'invalid' | 'form' | 'done'>(token.value ? 'loading' : 'invalid')
const submitted = ref(false)
const busy = ref(false)

useHead({ title: () => t('auth.invite.title') })

onMounted(async () => {
  if (!token.value) return
  try {
    const { data } = await api<DataResponse<{ email: string; displayName: string }>>(
      '/auth/invites/inspect',
      {
        method: 'POST',
        body: { token: token.value },
      },
    )
    invite.value = data
    displayName.value = data.displayName
    state.value = 'form'
  } catch {
    state.value = 'invalid'
  }
})

async function submit() {
  submitted.value = true
  if (!displayName.value.trim()) errors.fields.displayName = t('auth.errors.nameRequired')
  if (!fields.value?.valid || !displayName.value.trim()) return
  busy.value = true
  errors.clear()
  try {
    await api('/auth/invites/accept', {
      method: 'POST',
      body: { token: token.value, password: password.value, displayName: displayName.value.trim() },
    })
    state.value = 'done'
  } catch (error) {
    if (isApiError(error) && error.code === 'auth.invalid_token') state.value = 'invalid'
    else errors.apply(error, ['password', 'displayName'])
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="state === 'loading'" class="grid gap-3">
    <USkeleton class="h-9 w-3/4" />
    <USkeleton class="h-5 w-full" />
    <USkeleton class="h-40 w-full" />
  </div>

  <PlatformAuthPanel
    v-else-if="state === 'invalid'"
    :title="t('auth.link.invalidTitle')"
    :subtitle="t('auth.invite.invalidText')"
    icon="i-lucide-link-2-off"
    tone="bad"
  >
    <UButton to="/auth/sign-in" size="xl" block color="neutral" variant="outline">
      {{ t('auth.backToSignIn') }}
    </UButton>
  </PlatformAuthPanel>

  <PlatformAuthPanel
    v-else-if="state === 'done'"
    :title="t('auth.invite.doneTitle')"
    :subtitle="t('auth.invite.doneText')"
    icon="i-lucide-party-popper"
    tone="ok"
  >
    <UButton :to="{ path: '/auth/sign-in' }" size="xl" block>{{ t('auth.signIn.submit') }}</UButton>
  </PlatformAuthPanel>

  <PlatformAuthPanel v-else :title="t('auth.invite.title')" :error="errors.message.value">
    <template #subtitle>
      <i18n-t keypath="auth.invite.subtitle" tag="span" scope="global">
        <template #email>
          <b>{{ invite?.email }}</b>
        </template>
      </i18n-t>
    </template>
    <form class="grid gap-4" novalidate @submit.prevent="submit">
      <UFormField :label="t('auth.fields.displayName')" :error="errors.fields.displayName">
        <UInput v-model="displayName" autocomplete="name" size="lg" class="w-full" autofocus />
      </UFormField>
      <PlatformAuthNewPassword
        ref="fields"
        v-model="password"
        :email="invite?.email"
        :name="displayName"
        :error="errors.fields.password"
        :submitted="submitted"
      />
      <UButton type="submit" size="xl" block :loading="busy">{{ t('auth.invite.submit') }}</UButton>
    </form>
  </PlatformAuthPanel>
</template>

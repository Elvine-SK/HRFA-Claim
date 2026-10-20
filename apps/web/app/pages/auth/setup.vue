<script setup lang="ts">
definePageMeta({ layout: 'auth', auth: false, title: 'auth.setup.title' })

const { t } = useI18n()
const api = useApi()
const linkToken = useLinkToken()
const errors = useFormErrors<'token' | 'email' | 'displayName' | 'password'>()
const { data: status, isPending } = useApiItem<{ open: boolean }>('auth', '/auth/setup', { staleTime: 0 })

const step = ref(1)
const token = ref(linkToken.value ?? '')
const email = ref('')
const displayName = ref('')
const password = ref('')
const fields = useTemplateRef('fields')
const submitted = ref(false)
const busy = ref(false)
const done = ref(false)

useHead({ title: () => t('auth.setup.title') })

function next() {
  errors.clear()
  if (!token.value.trim()) errors.fields.token = t('auth.setup.tokenRequired')
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) errors.fields.email = t('auth.errors.emailInvalid')
  if (!displayName.value.trim()) errors.fields.displayName = t('auth.errors.nameRequired')
  if (!errors.fields.token && !errors.fields.email && !errors.fields.displayName) step.value = 2
}

async function submit() {
  submitted.value = true
  if (!fields.value?.valid) return
  busy.value = true
  errors.clear()
  try {
    await api('/auth/setup', {
      method: 'POST',
      body: {
        token: token.value.trim(),
        email: email.value.trim(),
        displayName: displayName.value.trim(),
        password: password.value,
      },
    })
    done.value = true
  } catch (error) {
    errors.apply(error, ['token', 'email', 'displayName', 'password'])
    if (errors.fields.token || errors.fields.email || errors.fields.displayName) step.value = 1
    if (isApiError(error) && error.code === 'auth.invalid_token') {
      errors.fields.token = t('auth.setup.tokenInvalid')
      step.value = 1
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="isPending" class="grid gap-3">
    <USkeleton class="h-9 w-3/4" />
    <USkeleton class="h-40 w-full" />
  </div>

  <PlatformAuthPanel
    v-else-if="done"
    :title="t('auth.setup.doneTitle')"
    :subtitle="t('auth.setup.doneText')"
    icon="i-lucide-rocket"
    tone="ok"
  >
    <UButton to="/auth/sign-in" size="xl" block>{{ t('auth.signIn.submit') }}</UButton>
  </PlatformAuthPanel>

  <PlatformAuthPanel
    v-else-if="!status?.open"
    :title="t('auth.setup.closedTitle')"
    :subtitle="t('auth.setup.closedText')"
    icon="i-lucide-lock"
  >
    <UButton to="/auth/sign-in" size="xl" block>{{ t('auth.signIn.submit') }}</UButton>
  </PlatformAuthPanel>

  <PlatformAuthPanel
    v-else
    :title="t('auth.setup.title')"
    :subtitle="t('auth.setup.subtitle')"
    :error="errors.message.value"
  >
    <div class="setup-steps" aria-hidden="true">
      <i :class="{ on: step >= 1 }" />
      <i :class="{ on: step >= 2 }" />
    </div>
    <p class="eyebrow mb-3">{{ t('auth.setup.step', { n: step, total: 2 }) }}</p>

    <form v-if="step === 1" class="grid gap-4" novalidate @submit.prevent="next">
      <UFormField
        :label="t('auth.setup.token')"
        :hint="t('auth.setup.tokenHint')"
        :error="errors.fields.token"
      >
        <UInput v-model="token" autocomplete="off" size="lg" class="w-full" :ui="{ base: 'font-mono' }" />
      </UFormField>
      <UFormField :label="t('auth.fields.displayName')" :error="errors.fields.displayName">
        <UInput v-model="displayName" autocomplete="name" size="lg" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.fields.email')" :error="errors.fields.email">
        <UInput v-model="email" type="email" autocomplete="email" size="lg" class="w-full" />
      </UFormField>
      <UButton type="submit" size="xl" block trailing-icon="i-lucide-arrow-right">
        {{ t('platform.actions.continue') }}
      </UButton>
    </form>

    <form v-else class="grid gap-5" novalidate @submit.prevent="submit">
      <PlatformAuthNewPassword
        ref="fields"
        v-model="password"
        :email="email"
        :name="displayName"
        :error="errors.fields.password"
        :submitted="submitted"
      />
      <div class="flex gap-2">
        <UButton size="xl" color="neutral" variant="outline" icon="i-lucide-arrow-left" @click="step = 1">
          {{ t('platform.actions.back') }}
        </UButton>
        <UButton type="submit" size="xl" :loading="busy" class="flex-1 justify-center">
          {{ t('auth.setup.submit') }}
        </UButton>
      </div>
    </form>
  </PlatformAuthPanel>
</template>

<style scoped>
.setup-steps {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.setup-steps i {
  height: 5px;
  flex: 1;
  border-radius: 9px;
  background: var(--app-surface-2);
}
.setup-steps i.on {
  background: var(--app-grad);
}
</style>

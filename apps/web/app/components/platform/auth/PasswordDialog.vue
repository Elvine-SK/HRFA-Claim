<script setup lang="ts">
const props = defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  action: (password: string) => Promise<void>
}>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const errors = useFormErrors<'password'>()
const password = ref('')
const busy = ref(false)

watch(open, (value) => {
  if (!value) return
  password.value = ''
  errors.clear()
})

async function submit() {
  if (!password.value) {
    errors.fields.password = t('auth.errors.passwordRequired')
    return
  }
  busy.value = true
  errors.clear()
  try {
    await props.action(password.value)
    open.value = false
  } catch (error) {
    if (isApiError(error) && (error.code === 'auth.wrong_password' || error.status === 401))
      errors.fields.password = t('errors.auth_wrong_password')
    else errors.apply(error, ['password'])
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description ?? t('auth.reauth.text')">
    <template #body>
      <form id="password-dialog" class="grid gap-3" @submit.prevent="submit">
        <UAlert
          v-if="errors.message.value"
          color="error"
          variant="subtle"
          :description="errors.message.value"
          role="alert"
        />
        <UFormField :label="t('auth.fields.currentPassword')" :error="errors.fields.password">
          <PlatformAuthPasswordInput v-model="password" :invalid="!!errors.fields.password" autofocus />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :disabled="busy" @click="open = false">
          {{ t('platform.actions.cancel') }}
        </UButton>
        <UButton type="submit" form="password-dialog" :color="danger ? 'error' : 'primary'" :loading="busy">
          {{ confirmLabel ?? t('platform.actions.confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

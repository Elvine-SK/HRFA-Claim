<script setup lang="ts">
/** Creates a user who signs in from a host portal: no password, no invitation, assignable right away. */
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const notify = useNotify()
const action = useAdminAction()
const errors = useFormErrors<'host' | 'externalId' | 'username' | 'displayName' | 'email'>()
const manifest = useManifest()
const hosts = computed(() => manifest.data.value?.handoff?.hosts ?? [])

const form = reactive({ host: '', externalId: '', username: '', displayName: '', email: '' })

watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(form, {
    host: hosts.value[0]?.key ?? '',
    externalId: '',
    username: '',
    displayName: '',
    email: '',
  })
  errors.clear()
})

async function submit() {
  errors.clear()
  const email = form.email.trim()
  if (!form.externalId.trim()) errors.fields.externalId = t('handoff.admin.externalIdHint')
  if (!form.displayName.trim()) errors.fields.displayName = t('auth.errors.nameRequired')
  if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.fields.email = t('auth.errors.emailInvalid')
  if (form.username.trim() ? !isUsername(form.username) : !email)
    errors.fields.username = t(
      form.username.trim() ? 'admin.users.usernameInvalid' : 'admin.users.usernameRequired',
    )
  if (Object.keys(errors.fields).length) return
  try {
    await action.mutateAsync({
      path: '/auth/handoff/admin/users',
      body: {
        host: form.host,
        externalId: form.externalId.trim(),
        displayName: form.displayName.trim(),
        ...(email ? { email } : {}),
        ...(form.username.trim() ? { username: form.username.trim() } : {}),
      },
    })
    notify.success(t('handoff.admin.created', { name: form.displayName.trim() }))
    open.value = false
  } catch (error) {
    if (isApiError(error) && error.status === 409) errors.message.value = t('handoff.admin.taken')
    else errors.apply(error, ['host', 'externalId', 'username', 'displayName', 'email'])
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('handoff.admin.addTitle')" :description="t('handoff.admin.addText')">
    <template #body>
      <form id="portal-user-form" class="grid gap-3" data-testid="portal-user-form" @submit.prevent="submit">
        <UAlert
          v-if="errors.message.value"
          color="error"
          variant="subtle"
          :description="errors.message.value"
        />
        <UFormField
          v-if="hosts.length > 1"
          :label="t('handoff.admin.host')"
          :error="errors.fields.host"
          required
        >
          <USelect
            v-model="form.host"
            :items="hosts.map((h) => ({ label: h.label, value: h.key }))"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('handoff.admin.externalId')"
          :hint="t('handoff.admin.externalIdHint')"
          :error="errors.fields.externalId"
          required
        >
          <UInput v-model="form.externalId" class="w-full" autofocus :ui="{ base: 'font-mono' }" />
        </UFormField>
        <UFormField :label="t('admin.users.name')" :error="errors.fields.displayName" required>
          <UInput v-model="form.displayName" class="w-full" />
        </UFormField>
        <UFormField :label="t('auth.fields.email')" :error="errors.fields.email">
          <UInput v-model="form.email" type="email" class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.users.username')" :error="errors.fields.username">
          <UInput v-model="form.username" class="w-full" :ui="{ base: 'font-mono' }" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">{{
          t('platform.actions.cancel')
        }}</UButton>
        <UButton
          type="submit"
          form="portal-user-form"
          icon="i-lucide-user-plus"
          :loading="action.isPending.value"
        >
          {{ t('handoff.admin.add') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { UserAdmin } from '../../../types/platform'

/** Without `user`: creates one. With `user`: replaces that person's password. Either way the password is temporary. */
const props = defineProps<{ user?: UserAdmin | null }>()
const open = defineModel<boolean>('open', { default: false })

const { t, locales } = useI18n()
const { dateTime } = useDates()
const notify = useNotify()
const action = useAdminAction()
const errors = useFormErrors<'email' | 'username' | 'displayName' | 'password'>()
const manifest = useManifest()
const rules = computed(() => manifest.data.value?.auth ?? { usernameRequired: false, emailRequired: true })
/** Without an email the username is the only name to sign in with. */
const usernameNeeded = computed(() => rules.value.usernameRequired || !form.email.trim())
function offerUsername() {
  if (rules.value.usernameRequired && !form.username.trim()) form.username = suggestUsername(form.email)
}

const form = reactive({
  email: '',
  username: '',
  displayName: '',
  locale: 'auto',
  mfaRequired: false,
  password: '',
})
/** Set once saved: the password is shown one last time for the administrator to hand over. */
const handOver = ref<{ name: string; password: string; expiresAt: string | null } | null>(null)
const copied = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(form, { email: '', username: '', displayName: '', locale: 'auto', mfaRequired: false })
  form.password = temporaryPassword()
  errors.clear()
  handOver.value = null
  copied.value = false
})

async function submit() {
  errors.clear()
  const target = props.user
  if (!target) {
    const email = form.email.trim()
    if (email ? !/^\S+@\S+\.\S+$/.test(email) : rules.value.emailRequired)
      errors.fields.email = t('auth.errors.emailInvalid')
    if (form.username.trim() ? !isUsername(form.username) : usernameNeeded.value)
      errors.fields.username = t(
        form.username.trim() ? 'admin.users.usernameInvalid' : 'admin.users.usernameRequired',
      )
    if (!form.displayName.trim()) errors.fields.displayName = t('auth.errors.nameRequired')
  }
  const who = target
    ? { email: target.email, name: target.displayName }
    : { email: form.email.trim(), name: form.displayName.trim() }
  if (!passwordAcceptable(form.password, who)) errors.fields.password = t('auth.password.weak')
  if (Object.keys(errors.fields).length) return
  try {
    let expiresAt: string | null = null
    if (target) {
      await action.mutateAsync({
        path: `/users/${target.id}/temporary-password`,
        body: { password: form.password },
      })
    } else {
      const created = (await action.mutateAsync({
        path: '/users',
        body: {
          ...(who.email ? { email: who.email } : {}),
          ...(form.username.trim() ? { username: form.username.trim() } : {}),
          displayName: who.name,
          mfaRequired: form.mfaRequired,
          password: form.password,
          ...(form.locale === 'auto' ? {} : { locale: form.locale }),
        },
      })) as UserAdmin
      expiresAt = created.passwordExpiresAt
    }
    notify.success(
      target
        ? t('admin.users.tempSet')
        : t('admin.users.created', { email: who.email || form.username.trim() }),
    )
    handOver.value = { name: who.name, password: form.password, expiresAt }
  } catch (error) {
    errors.apply(error, ['email', 'username', 'displayName', 'password'])
  }
}

async function copy() {
  if (!handOver.value) return
  await navigator.clipboard.writeText(handOver.value.password)
  copied.value = true
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="user ? t('admin.users.setTempTitle', { name: user.displayName }) : t('admin.users.createTitle')"
    :description="user ? t('admin.users.setTempText') : t('admin.users.createText')"
  >
    <template #body>
      <div v-if="handOver" class="grid gap-3" data-testid="temp-password-result">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-key-round"
          :title="t('admin.users.handOver', { name: handOver.name })"
          :description="
            handOver.expiresAt
              ? t('admin.users.handOverUntil', { when: dateTime(handOver.expiresAt) })
              : t('admin.users.handOverHours')
          "
        />
        <div class="flex gap-2">
          <UInput
            :model-value="handOver.password"
            readonly
            class="flex-1"
            :aria-label="t('admin.users.tempPassword')"
            :ui="{ base: 'font-mono' }"
          />
          <UButton
            color="neutral"
            variant="outline"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            @click="copy"
          >
            {{ copied ? t('platform.actions.copied') : t('platform.actions.copy') }}
          </UButton>
        </div>
      </div>
      <form v-else id="user-password-form" class="grid gap-4" novalidate @submit.prevent="submit">
        <UAlert
          v-if="errors.message.value"
          color="error"
          variant="subtle"
          :description="errors.message.value"
        />
        <template v-if="!user">
          <UFormField
            :label="t('auth.fields.email')"
            :hint="rules.emailRequired ? undefined : t('admin.users.emailOptionalHint')"
            :error="errors.fields.email"
            :required="rules.emailRequired"
          >
            <UInput v-model="form.email" type="email" class="w-full" autofocus @blur="offerUsername" />
          </UFormField>
          <UFormField
            :label="t('admin.users.username')"
            :hint="t(usernameNeeded ? 'admin.users.usernameHintRequired' : 'admin.users.usernameHint')"
            :error="errors.fields.username"
            :required="usernameNeeded"
          >
            <UInput
              v-model="form.username"
              name="new-username"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              class="w-full"
              :ui="{ base: 'font-mono' }"
            />
          </UFormField>
          <UFormField :label="t('admin.users.name')" :error="errors.fields.displayName" required>
            <UInput v-model="form.displayName" class="w-full" />
          </UFormField>
          <UFormField :label="t('account.profile.locale')">
            <USelect
              v-model="form.locale"
              :items="[
                { value: 'auto', label: t('admin.users.localeDefault') },
                ...locales.map((l) => ({ value: l.code, label: l.name ?? l.code })),
              ]"
              class="w-full"
            />
          </UFormField>
        </template>
        <UFormField
          :label="t('admin.users.tempPassword')"
          :hint="t('admin.users.tempPasswordHint', { n: PASSWORD_MIN })"
          :error="errors.fields.password"
          required
        >
          <div class="flex gap-2">
            <UInput
              v-model="form.password"
              name="temporary-password"
              autocomplete="off"
              class="flex-1"
              :ui="{ base: 'font-mono' }"
            />
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              @click="form.password = temporaryPassword()"
            >
              {{ t('admin.users.generate') }}
            </UButton>
          </div>
        </UFormField>
        <USwitch
          v-if="!user"
          v-model="form.mfaRequired"
          :label="t('admin.users.mfaRequired')"
          :description="t('admin.users.mfaRequiredHint')"
        />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton v-if="handOver" @click="open = false">{{ t('platform.actions.done') }}</UButton>
        <template v-else>
          <UButton color="neutral" variant="ghost" @click="open = false">{{
            t('platform.actions.cancel')
          }}</UButton>
          <UButton
            type="submit"
            form="user-password-form"
            icon="i-lucide-key-round"
            :loading="action.isPending.value"
          >
            {{ user ? t('admin.users.setTempSubmit') : t('admin.users.createSubmit') }}
          </UButton>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const { t, locales } = useI18n()
const api = useApi()
const notify = useNotify()
const session = useSession()
const preferences = useLocalePreference()
const errors = useFormErrors<'displayName' | 'timezone'>()

const user = computed(() => session.user.value)
const displayName = ref(user.value?.displayName ?? '')
const locale = ref<string>(user.value?.locale ?? 'auto')
const timezone = ref<string>(user.value?.timezone ?? 'auto')
const saving = ref(false)
const emailOpen = ref(false)
const newEmail = ref('')
const resending = ref(false)

watch(user, (u) => {
  displayName.value = u?.displayName ?? ''
  locale.value = u?.locale ?? 'auto'
  timezone.value = u?.timezone ?? 'auto'
})

const localeItems = computed(() => [
  { value: 'auto', label: t('account.profile.localeAuto') },
  ...locales.value.map((l) => ({ value: l.code, label: l.name ?? l.code })),
])
const timezoneItems = computed(() => [
  {
    value: 'auto',
    label: t('account.profile.timezoneAuto', { tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  },
  ...Intl.supportedValuesOf('timeZone').map((tz) => ({ value: tz, label: tz })),
])

async function save() {
  errors.clear()
  if (!displayName.value.trim()) {
    errors.fields.displayName = t('auth.errors.nameRequired')
    return
  }
  saving.value = true
  try {
    await api('/auth/me', {
      method: 'PATCH',
      body: {
        displayName: displayName.value.trim(),
        locale: locale.value === 'auto' ? null : locale.value,
        timezone: timezone.value === 'auto' ? null : timezone.value,
      },
    })
    await session.loadMe()
    if (locale.value !== 'auto') await preferences.change(locale.value)
    notify.success(t('platform.toast.saved'))
  } catch (error) {
    errors.apply(error, ['displayName', 'timezone'])
  } finally {
    saving.value = false
  }
}

const emailErrors = useFormErrors<'email' | 'password'>()
const emailPassword = ref('')
const emailBusy = ref(false)

function openEmail() {
  newEmail.value = ''
  emailPassword.value = ''
  emailErrors.clear()
  emailOpen.value = true
}

async function changeEmail() {
  emailErrors.clear()
  if (!/^\S+@\S+\.\S+$/.test(newEmail.value.trim())) emailErrors.fields.email = t('auth.errors.emailInvalid')
  if (!emailPassword.value) emailErrors.fields.password = t('auth.errors.passwordRequired')
  if (emailErrors.fields.email || emailErrors.fields.password) return
  emailBusy.value = true
  try {
    await api('/auth/me/email', {
      method: 'POST',
      body: { email: newEmail.value.trim(), password: emailPassword.value },
    })
    emailOpen.value = false
    notify.success(t('account.profile.emailSent', { email: newEmail.value.trim() }))
  } catch (error) {
    emailErrors.apply(error, ['email', 'password'])
    if (isApiError(error) && error.code === 'auth.wrong_password')
      emailErrors.fields.password = t('errors.auth_wrong_password')
  } finally {
    emailBusy.value = false
  }
}

async function resendVerification() {
  resending.value = true
  try {
    await api('/auth/email/verify/resend', { method: 'POST' })
    notify.success(t('auth.verify.resent'))
  } catch (error) {
    notify.error(error)
  } finally {
    resending.value = false
  }
}
</script>

<template>
  <div class="grid gap-6">
    <section class="card">
      <header class="card-h">
        <h2>{{ t('account.profile.title') }}</h2>
        <p>{{ t('account.profile.subtitle') }}</p>
      </header>
      <form class="card-b grid gap-5" novalidate @submit.prevent="save">
        <div class="identity">
          <PlatformUserAvatar :name="user?.displayName" :seed="user?.id" size="lg" />
          <div class="min-w-0">
            <b class="block truncate">{{ user?.displayName }}</b>
            <span
              v-if="!user?.email"
              class="block text-[13px] text-[var(--app-muted)]"
              data-testid="account-no-email"
            >
              {{ t('account.profile.noEmail') }}
            </span>
            <span v-else class="flex flex-wrap items-center gap-2 text-[13px] text-[var(--app-muted)]">
              {{ user.email }}
              <UBadge
                v-if="user.emailVerified"
                color="success"
                variant="subtle"
                size="sm"
                icon="i-lucide-badge-check"
              >
                {{ t('account.profile.verified') }}
              </UBadge>
              <UBadge v-else color="warning" variant="subtle" size="sm">{{
                t('account.profile.unverified')
              }}</UBadge>
            </span>
          </div>
          <div class="ms-auto flex flex-wrap gap-2">
            <UButton
              v-if="user?.email && !user.emailVerified"
              size="sm"
              color="neutral"
              variant="outline"
              :loading="resending"
              @click="resendVerification"
            >
              {{ t('auth.verify.resend') }}
            </UButton>
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-mail" @click="openEmail">
              {{ t(user?.email ? 'account.profile.changeEmail' : 'account.profile.addEmail') }}
            </UButton>
          </div>
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField :label="t('auth.fields.displayName')" :error="errors.fields.displayName">
            <UInput v-model="displayName" autocomplete="name" class="w-full" />
          </UFormField>
          <UFormField :label="t('account.profile.username')" :help="t('account.profile.usernameHelp')">
            <UInput
              :model-value="user?.username ?? ''"
              :placeholder="t('account.profile.usernameNone')"
              data-testid="account-username"
              class="w-full"
              readonly
              disabled
            />
          </UFormField>
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField :label="t('account.profile.locale')">
            <USelect v-model="locale" :items="localeItems" class="w-full" />
          </UFormField>
          <UFormField :label="t('account.profile.timezone')" :error="errors.fields.timezone">
            <USelectMenu
              v-model="timezone"
              :items="timezoneItems"
              value-key="value"
              class="w-full"
              :search-input="{ placeholder: t('platform.list.search') }"
            />
          </UFormField>
        </div>
        <UAlert
          v-if="errors.message.value"
          color="error"
          variant="subtle"
          :description="errors.message.value"
        />
        <div class="flex justify-end">
          <UButton type="submit" :loading="saving" icon="i-lucide-check">{{
            t('platform.actions.saveChanges')
          }}</UButton>
        </div>
      </form>
    </section>

    <UModal
      v-model:open="emailOpen"
      :title="t(user?.email ? 'account.profile.changeEmail' : 'account.profile.addEmail')"
      :description="t(user?.email ? 'account.profile.changeEmailText' : 'account.profile.addEmailText')"
    >
      <template #body>
        <form id="email-form" class="grid gap-4" novalidate @submit.prevent="changeEmail">
          <UAlert
            v-if="emailErrors.message.value"
            color="error"
            variant="subtle"
            :description="emailErrors.message.value"
          />
          <UFormField :label="t('account.profile.newEmail')" :error="emailErrors.fields.email">
            <UInput v-model="newEmail" type="email" autocomplete="email" class="w-full" autofocus />
          </UFormField>
          <UFormField :label="t('auth.fields.currentPassword')" :error="emailErrors.fields.password">
            <PlatformAuthPasswordInput v-model="emailPassword" :invalid="!!emailErrors.fields.password" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="emailOpen = false">{{
            t('platform.actions.cancel')
          }}</UButton>
          <UButton type="submit" form="email-form" :loading="emailBusy">{{
            t('platform.actions.send')
          }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.identity {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--app-border);
}
</style>

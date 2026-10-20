<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'
import type { SessionInfo } from '@elvine-sk/platform-nuxt/utils'
import { useQuery, useQueryClient } from '@tanstack/vue-query'

interface MfaList {
  methods: {
    id: string
    type: 'totp' | 'email'
    label: string | null
    createdAt: string
    lastUsedAt: string | null
  }[]
  recoveryCodesRemaining: number
}

const { t } = useI18n()
const api = useApi()
const notify = useNotify()
const session = useSession()
const dates = useDates()
const client = useQueryClient()

const mfa = useQuery({
  queryKey: ['auth', 'mfa'],
  queryFn: async () => (await api<DataResponse<MfaList>>('/auth/mfa')).data,
})
const refreshMfa = async () => {
  await client.invalidateQueries({ queryKey: ['auth', 'mfa'] })
  await session.loadMe()
}

const pw = reactive({ current: '', next: '' })
const pwErrors = useFormErrors<'currentPassword' | 'newPassword'>()
const pwFields = useTemplateRef('pwFields')
const pwSubmitted = ref(false)
const pwBusy = ref(false)

async function changePassword() {
  pwSubmitted.value = true
  pwErrors.clear()
  if (!pw.current) pwErrors.fields.currentPassword = t('auth.errors.passwordRequired')
  if (!pwFields.value?.valid || !pw.current) return
  pwBusy.value = true
  try {
    await api('/auth/password/change', {
      method: 'POST',
      body: { currentPassword: pw.current, newPassword: pw.next },
    })
    pw.current = ''
    pw.next = ''
    pwSubmitted.value = false
    notify.success(t('account.security.passwordChanged'), t('account.security.passwordChangedText'))
  } catch (error) {
    pwErrors.apply(error, ['currentPassword', 'newPassword'])
    if (isApiError(error) && error.code === 'auth.wrong_password')
      pwErrors.fields.currentPassword = t('errors.auth_wrong_password')
  } finally {
    pwBusy.value = false
  }
}

const enrollOpen = ref(false)
const enrolledTypes = computed(() => new Set(mfa.data.value?.methods.map((m) => m.type)))
// Codes by email need an address to send them to.
const addable = computed(() =>
  (['totp', 'email'] as const).filter(
    (m) => !enrolledTypes.value.has(m) && (m !== 'email' || session.user.value?.email),
  ),
)

async function enrolled(next: SessionInfo) {
  enrollOpen.value = false
  if (next.csrfToken) session.apply(next)
  await refreshMfa()
  notify.success(t('account.security.mfaAdded'))
}

const removing = ref<MfaList['methods'][number] | null>(null)
const removeOpen = computed({
  get: () => !!removing.value,
  set: (v) => {
    if (!v) removing.value = null
  },
})
async function removeMethod(password: string) {
  if (!removing.value) return
  await api(`/auth/mfa/${removing.value.id}`, { method: 'DELETE', body: { password } })
  await refreshMfa()
  notify.success(t('account.security.mfaRemoved'))
}

const regenOpen = ref(false)
const newCodes = ref<string[] | null>(null)
const codesAck = ref(false)
async function regenerate(password: string) {
  const { data } = await api<DataResponse<{ recoveryCodes: string[] }>>('/auth/mfa/recovery-codes', {
    method: 'POST',
    body: { password },
  })
  codesAck.value = false
  newCodes.value = data.recoveryCodes
  await refreshMfa()
}
</script>

<template>
  <div class="grid gap-6">
    <section class="card">
      <header class="card-h">
        <h2>{{ t('account.security.passwordTitle') }}</h2>
        <p>{{ t('account.security.passwordText') }}</p>
      </header>
      <form class="card-b grid max-w-md gap-4" novalidate @submit.prevent="changePassword">
        <UAlert
          v-if="pwErrors.message.value"
          color="error"
          variant="subtle"
          :description="pwErrors.message.value"
        />
        <UFormField :label="t('auth.fields.currentPassword')" :error="pwErrors.fields.currentPassword">
          <PlatformAuthPasswordInput
            id="current-password"
            v-model="pw.current"
            :invalid="!!pwErrors.fields.currentPassword"
          />
        </UFormField>
        <PlatformAuthNewPassword
          ref="pwFields"
          v-model="pw.next"
          :email="session.user.value?.email"
          :name="session.user.value?.displayName"
          :error="pwErrors.fields.newPassword"
          :submitted="pwSubmitted"
        />
        <div>
          <UButton type="submit" :loading="pwBusy">{{ t('account.security.changePassword') }}</UButton>
        </div>
      </form>
    </section>

    <PlatformAccountSignInProviders />

    <section class="card">
      <header class="card-h">
        <div class="flex-1">
          <h2>{{ t('account.security.mfaTitle') }}</h2>
          <p>{{ t('account.security.mfaText') }}</p>
        </div>
        <UButton v-if="addable.length" icon="i-lucide-plus" size="sm" @click="enrollOpen = true">
          {{ t('account.security.addMethod') }}
        </UButton>
      </header>
      <ul class="card-list">
        <li v-if="mfa.isPending.value"><USkeleton class="h-6 w-full" /></li>
        <li v-else-if="!mfa.data.value?.methods.length" class="text-[13px] text-[var(--app-muted)]">
          <UIcon name="i-lucide-shield-alert" class="size-5 text-[var(--app-warn)]" />
          {{ t('account.security.noMethods') }}
        </li>
        <li v-for="m in mfa.data.value?.methods ?? []" :key="m.id">
          <span class="m-ico"
            ><UIcon :name="m.type === 'totp' ? 'i-lucide-smartphone' : 'i-lucide-mail'"
          /></span>
          <div class="min-w-0 flex-1">
            <b class="block text-[13.5px]">{{ m.label || t(`auth.mfa.method.${m.type}`) }}</b>
            <span class="text-[12.5px] text-[var(--app-muted)]">
              {{ t('account.security.added', { date: dates.date(m.createdAt) }) }} ·
              {{
                m.lastUsedAt
                  ? t('account.security.lastUsed', { when: dates.relative(m.lastUsedAt) })
                  : t('account.security.neverUsed')
              }}
            </span>
          </div>
          <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" @click="removing = m">
            {{ t('platform.actions.remove') }}
          </UButton>
        </li>
        <li v-if="mfa.data.value?.methods.length">
          <span class="m-ico"><UIcon name="i-lucide-key-round" /></span>
          <div class="min-w-0 flex-1">
            <b class="block text-[13.5px]">{{ t('auth.recovery.title') }}</b>
            <span
              class="text-[12.5px]"
              :class="
                mfa.data.value.recoveryCodesRemaining < 3
                  ? 'text-[var(--app-warn)]'
                  : 'text-[var(--app-muted)]'
              "
            >
              {{
                t(
                  'account.security.codesLeft',
                  { n: mfa.data.value.recoveryCodesRemaining },
                  mfa.data.value.recoveryCodesRemaining,
                )
              }}
            </span>
          </div>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            @click="regenOpen = true"
          >
            {{ t('account.security.regenerate') }}
          </UButton>
        </li>
      </ul>
    </section>

    <section class="card">
      <header class="card-h">
        <h2>{{ t('account.security.tokensTitle') }}</h2>
        <p>{{ t('account.security.tokensText') }}</p>
      </header>
      <div class="card-b">
        <PlatformEmptyState
          icon="i-lucide-key-square"
          tone="neutral"
          :title="t('account.security.tokensEmpty')"
          :text="t('account.security.tokensUnavailable')"
        />
      </div>
    </section>

    <UModal v-model:open="enrollOpen" :title="t('account.security.addMethod')" :ui="{ content: 'max-w-lg' }">
      <template #body>
        <PlatformAuthMfaEnroll v-if="enrollOpen" require-password :available="addable" @done="enrolled" />
      </template>
    </UModal>

    <PlatformAuthPasswordDialog
      v-model:open="removeOpen"
      :title="t('account.security.removeTitle')"
      :description="t('account.security.removeText')"
      :confirm-label="t('platform.actions.remove')"
      danger
      :action="removeMethod"
    />
    <PlatformAuthPasswordDialog
      v-model:open="regenOpen"
      :title="t('account.security.regenerate')"
      :description="t('account.security.regenerateText')"
      :action="regenerate"
    />
    <UModal
      :open="!!newCodes"
      :title="t('auth.recovery.title')"
      :description="t('auth.recovery.text')"
      :dismissible="false"
      :close="false"
    >
      <template #body>
        <PlatformAuthRecoveryCodes v-if="newCodes" v-model:acknowledged="codesAck" :codes="newCodes" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton :disabled="!codesAck" @click="newCodes = null">{{ t('platform.actions.done') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.m-ico {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: var(--app-r-sm);
  background: color-mix(in oklab, var(--app-accent) 11%, transparent);
  color: var(--app-accent);
}
</style>

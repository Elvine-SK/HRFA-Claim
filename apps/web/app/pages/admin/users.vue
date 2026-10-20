<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'
import type { DataTableColumn, DataTableStatusTab } from '../../components/platform/DataTable.vue'
import type { StatItem } from '../../components/platform/StatStrip.vue'
import type { UserAdmin, UsersOverview, UserStatus } from '../../types/platform'

definePageMeta({ title: 'admin.nav.users', permission: 'user.read' })

const { t, locales } = useI18n()
const { date, relative, dateTime } = useDates()
const notify = useNotify()
const confirm = useConfirm()
const access = useAccess()
const api = useApi()
const action = useAdminAction()

useHead({ title: () => t('admin.nav.users') })

const list = useListQuery({ defaults: { sort: [{ field: 'createdAt', dir: 'desc' }] } })
const users = useApiList<UserAdmin>(ADMIN_KEY, '/users', list)

const columns = computed<DataTableColumn<UserAdmin>[]>(() => [
  { key: 'displayName', label: t('admin.users.name'), sortable: true, locked: true, primary: true },
  { key: 'username', label: t('admin.users.username'), sortable: true, mono: true, card: true },
  { key: 'status', label: t('admin.users.status'), card: true },
  { key: 'mfaRequired', label: t('admin.users.mfa'), hiddenByDefault: true },
  { key: 'lastLoginAt', label: t('admin.users.lastLogin'), sortable: true, card: true },
  { key: 'createdAt', label: t('admin.users.created'), sortable: true, mono: true, align: 'end' },
])
const overview = useApiItem<UsersOverview>(ADMIN_KEY, '/users/overview')
const STATUSES: UserStatus[] = ['active', 'invited', 'disabled']
const statusTabs = computed<DataTableStatusTab[]>(() => [
  { label: t('platform.list.all'), value: null, count: overview.data.value?.total },
  ...STATUSES.map((s) => ({
    label: t(`admin.users.statuses.${s}`),
    value: s,
    count: overview.data.value?.[s],
  })),
])
// A status number filters the list by that status; clicking it again shows everyone.
const statusStat = (status: UserStatus) => {
  const active = list.filterValue('status', 'eq') === status
  return { active, onClick: () => void list.setFilter('status', 'eq', active ? undefined : status) }
}
const stats = computed<StatItem[]>(() => {
  const o = overview.data.value
  return [
    {
      label: t('admin.users.stats.total'),
      value: o?.total,
      icon: 'i-lucide-users',
      onClick: () => void list.setFilter('status', 'eq', undefined),
    },
    {
      label: t('admin.users.stats.active'),
      value: o?.active,
      icon: 'i-lucide-user-check',
      tone: 'success',
      hint: t('admin.users.stats.activeHint'),
      ...statusStat('active'),
    },
    {
      label: t('admin.users.stats.invited'),
      value: o?.invited,
      icon: 'i-lucide-mail',
      tone: 'info',
      hint: t('admin.users.stats.invitedHint'),
      ...statusStat('invited'),
    },
    {
      label: t('admin.users.stats.disabled'),
      value: o?.disabled,
      icon: 'i-lucide-user-x',
      tone: 'neutral',
      hint: t('admin.users.stats.disabledHint'),
      ...statusStat('disabled'),
    },
    {
      label: t('admin.users.stats.mfa'),
      value: o ? (o.active ? Math.round((o.mfaEnrolled / o.active) * 100) : 0) : undefined,
      unit: '%',
      icon: 'i-lucide-shield-check',
      tone: 'accent',
      hint: o ? t('admin.users.stats.mfaHint', { n: o.mfaEnrolled, total: o.active }) : undefined,
    },
  ]
})
const filterLabels = computed(() => ({
  email: t('auth.fields.email'),
  username: t('admin.users.username'),
  displayName: t('admin.users.name'),
  createdAt: t('admin.users.created'),
  lastLoginAt: t('admin.users.lastLogin'),
}))

const selectedId = useQueryParam('user')
const drawerOpen = computed({
  get: () => !!selectedId.value,
  set: (open) => {
    if (!open) selectedId.value = undefined
  },
})
const item = useApiItem<UserAdmin>(ADMIN_KEY, () => (selectedId.value ? `/users/${selectedId.value}` : null))
const selected = computed(
  () => item.data.value ?? users.data.value?.data.find((u) => u.id === selectedId.value),
)
const locked = computed(
  () => !!selected.value?.lockedUntil && new Date(selected.value.lockedUntil) > new Date(),
)

async function run(path: string, body: unknown, message: string, method: 'POST' | 'PATCH' = 'POST') {
  try {
    await action.mutateAsync({ path, method, body })
    notify.success(message)
  } catch (error) {
    notify.error(error)
  }
}

async function toggleDisabled(user: UserAdmin) {
  const disabling = user.status !== 'disabled'
  if (disabling) {
    const ok = await confirm({
      title: t('admin.users.disableTitle', { name: user.displayName }),
      description: t('admin.users.disableText'),
      confirmLabel: t('admin.users.disable'),
      danger: true,
    })
    if (!ok) return
  }
  await run(
    `/users/${user.id}`,
    { status: disabling ? 'disabled' : 'active' },
    disabling ? t('admin.users.disabled') : t('admin.users.enabled'),
    'PATCH',
  )
}

async function revokeSessions(user: UserAdmin) {
  const ok = await confirm({
    title: t('admin.users.revokeTitle', { name: user.displayName }),
    description: t('admin.users.revokeText'),
    confirmLabel: t('admin.users.revoke'),
    danger: true,
  })
  if (ok) await run(`/users/${user.id}/revoke-sessions`, undefined, t('admin.users.revoked'))
}

const nameEdit = ref<string | null>(null)
async function saveName(user: UserAdmin) {
  if (!nameEdit.value?.trim()) return
  await run(`/users/${user.id}`, { displayName: nameEdit.value.trim() }, t('platform.toast.saved'), 'PATCH')
  nameEdit.value = null
}

/** `null`: not editing. An empty value removes the username. */
const usernameEdit = ref<string | null>(null)
const usernameError = ref('')
function editUsername(user: UserAdmin) {
  usernameError.value = ''
  usernameEdit.value = user.username ?? ''
}
async function saveUsername(user: UserAdmin) {
  const value = usernameEdit.value?.trim() ?? ''
  usernameError.value = value && !isUsername(value) ? t('admin.users.usernameInvalid') : ''
  if (usernameError.value) return
  try {
    await action.mutateAsync({
      path: `/users/${user.id}`,
      method: 'PATCH',
      body: { username: value || null },
    })
    notify.success(t('platform.toast.saved'))
    usernameEdit.value = null
  } catch (error) {
    if (isApiError(error) && error.status === 409) usernameError.value = t('admin.users.usernameTaken')
    else notify.error(error)
  }
}

const me = useSession().user
const isSelf = computed(() => !!selected.value && selected.value.id === me.value?.id)

/** `null`: not editing. An empty value removes the email, where the workspace allows users without one. */
const emailEdit = ref<string | null>(null)
const emailError = ref('')
// The address receives reset links, so for someone who already signs in it also takes `user.set_password`.
const canEditEmail = computed(
  () =>
    !!selected.value &&
    !isSelf.value &&
    access.can('user.update') &&
    (selected.value.status === 'invited' || access.can('user.set_password')),
)
function editEmail(user: UserAdmin) {
  emailError.value = ''
  emailEdit.value = user.email ?? ''
}
async function saveEmail(user: UserAdmin) {
  const value = emailEdit.value?.trim() ?? ''
  const required = manifest.data.value?.auth?.emailRequired ?? true
  emailError.value = (value ? !/^\S+@\S+\.\S+$/.test(value) : required) ? t('auth.errors.emailInvalid') : ''
  if (emailError.value) return
  try {
    await action.mutateAsync({ path: `/users/${user.id}`, method: 'PATCH', body: { email: value || null } })
    notify.success(t('platform.toast.saved'))
    emailEdit.value = null
  } catch (error) {
    if (isApiError(error) && error.status === 409) emailError.value = t('admin.users.emailTaken')
    else if (isApiError(error) && error.status === 422) emailError.value = error.message
    else notify.error(error)
  }
}
watch(selectedId, () => (emailEdit.value = null))

const passwordOpen = ref(false)
/** `null`: the dialog creates a user. */
const passwordFor = ref<UserAdmin | null>(null)
function openPassword(user: UserAdmin | null) {
  passwordFor.value = user
  passwordOpen.value = true
}

async function resetMfa(user: UserAdmin) {
  const ok = await confirm({
    title: t('admin.users.resetMfaTitle', { name: user.displayName }),
    description: t(user.mfaRequired ? 'admin.users.resetMfaTextRequired' : 'admin.users.resetMfaText'),
    confirmLabel: t('admin.users.resetMfa'),
    danger: true,
  })
  if (ok) await run(`/users/${user.id}/reset-mfa`, undefined, t('admin.users.mfaReset'))
}

const inviteOpen = ref(false)
const invite = reactive({ email: '', username: '', displayName: '', locale: 'auto', mfaRequired: false })
const inviteErrors = useFormErrors<'email' | 'username' | 'displayName'>()
const inviteBusy = ref(false)
const inviteLink = ref<string | null>(null)
const manifest = useManifest()
const usernameRequired = computed(() => manifest.data.value?.auth?.usernameRequired ?? false)
function offerUsername() {
  if (usernameRequired.value && !invite.username.trim()) invite.username = suggestUsername(invite.email)
}

function openInvite() {
  Object.assign(invite, { email: '', username: '', displayName: '', locale: 'auto', mfaRequired: false })
  inviteErrors.clear()
  inviteLink.value = null
  inviteOpen.value = true
}

async function sendInvite() {
  inviteErrors.clear()
  if (!/^\S+@\S+\.\S+$/.test(invite.email.trim())) inviteErrors.fields.email = t('auth.errors.emailInvalid')
  if (!invite.displayName.trim()) inviteErrors.fields.displayName = t('auth.errors.nameRequired')
  if (invite.username.trim() ? !isUsername(invite.username) : usernameRequired.value)
    inviteErrors.fields.username = t(
      invite.username.trim() ? 'admin.users.usernameInvalid' : 'admin.users.usernameRequired',
    )
  if (Object.keys(inviteErrors.fields).length) return
  inviteBusy.value = true
  try {
    const { data } = await api<DataResponse<UserAdmin & { inviteLink?: string }>>('/users', {
      method: 'POST',
      body: {
        email: invite.email.trim(),
        ...(invite.username.trim() ? { username: invite.username.trim() } : {}),
        displayName: invite.displayName.trim(),
        mfaRequired: invite.mfaRequired,
        ...(invite.locale === 'auto' ? {} : { locale: invite.locale }),
      },
    })
    await Promise.all([users.refetch(), overview.refetch()])
    notify.success(t('admin.users.invited', { email: data.email ?? '' }))
    if (data.inviteLink) inviteLink.value = data.inviteLink
    else inviteOpen.value = false
  } catch (error) {
    inviteErrors.apply(error, ['email', 'username', 'displayName'])
  } finally {
    inviteBusy.value = false
  }
}
</script>

<template>
  <div>
    <PlatformPageHeader
      :eyebrow="t('admin.nav.group')"
      :title="t('admin.users.title')"
      :subtitle="t('admin.users.subtitle')"
    >
      <template #actions>
        <UButton
          v-if="access.can('user.invite') && access.can('user.set_password')"
          color="neutral"
          variant="outline"
          icon="i-lucide-key-round"
          @click="openPassword(null)"
        >
          {{ t('admin.users.create') }}
        </UButton>
        <UButton v-can="'user.invite'" icon="i-lucide-user-plus" @click="openInvite">{{
          t('admin.users.invite')
        }}</UButton>
      </template>
    </PlatformPageHeader>

    <PlatformStatStrip :items="stats" :loading="overview.isPending.value" />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        id="admin-users"
        :rows="users.data.value?.data ?? []"
        :total="users.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="users"
        :filter-labels="filterLabels"
        :loading="users.isPending.value"
        :fetching="users.isFetching.value"
        :error="users.error.value"
        :status-tabs="statusTabs"
        :entities="t('admin.users.entities')"
        :caption="t('admin.users.title')"
        @select="(u) => (selectedId = u.id)"
        @retry="users.refetch()"
      >
        <template #cell-displayName="{ row, q }">
          <span class="inline-flex min-w-0 items-center gap-2.5">
            <PlatformUserAvatar :name="row.displayName" :seed="row.id" size="sm" />
            <span class="min-w-0">
              <b class="block truncate font-medium"
                ><PlatformHighlight :text="row.displayName" :query="q"
              /></b>
              <span class="block truncate text-[12px] text-[var(--app-muted)]">
                <PlatformHighlight v-if="row.email" :text="row.email" :query="q" />
                <template v-else>{{ t('admin.users.noEmail') }}</template>
              </span>
            </span>
          </span>
        </template>
        <template #cell-username="{ row, q }">
          <PlatformHighlight v-if="row.username" :text="row.username" :query="q" />
          <span v-else class="text-dimmed">—</span>
        </template>
        <template #cell-status="{ row }">
          <PlatformStatusBadge
            :tone="USER_STATUS_TONES[row.status]"
            :label="t(`admin.users.statuses.${row.status}`)"
          />
        </template>
        <template #cell-mfaRequired="{ row }">
          <UIcon
            v-if="row.mfaRequired"
            name="i-lucide-shield-check"
            class="size-4 text-[var(--app-ok)]"
            :aria-label="t('admin.users.mfaRequired')"
          />
          <span v-else class="text-dimmed">—</span>
        </template>
        <template #cell-lastLoginAt="{ row }">
          <UTooltip v-if="row.lastLoginAt" :text="dateTime(row.lastLoginAt)">
            <time :datetime="row.lastLoginAt">{{ relative(row.lastLoginAt) }}</time>
          </UTooltip>
          <span v-else class="text-dimmed">{{ t('admin.users.never') }}</span>
        </template>
        <template #cell-createdAt="{ row }">{{ date(row.createdAt) }}</template>
      </PlatformDataTable>
    </UCard>

    <PlatformEntityDrawer
      v-model:open="drawerOpen"
      :title="selected?.displayName ?? ''"
      :subtitle="selected?.email ?? selected?.username ?? undefined"
      icon="i-lucide-user"
      :loading="!selected && item.isPending.value"
    >
      <template v-if="selected" #badges>
        <PlatformStatusBadge
          :tone="USER_STATUS_TONES[selected.status]"
          :label="t(`admin.users.statuses.${selected.status}`)"
        />
        <UBadge v-if="selected.mfaRequired" color="success" variant="subtle" icon="i-lucide-shield-check">
          {{ t('admin.users.mfaRequired') }}
        </UBadge>
        <UBadge
          v-if="selected.passwordChangeRequired"
          color="warning"
          variant="subtle"
          icon="i-lucide-key-round"
        >
          {{ t('admin.users.tempPassword') }}
        </UBadge>
        <UBadge v-if="locked" color="error" variant="subtle" icon="i-lucide-lock">{{
          t('admin.users.locked')
        }}</UBadge>
      </template>
      <template v-if="selected" #actions>
        <UButton
          v-if="selected.status === 'invited'"
          v-can="'user.invite'"
          icon="i-lucide-send"
          @click="run(`/users/${selected.id}/resend-invite`, undefined, t('admin.users.inviteResent'))"
        >
          {{ t('admin.users.resendInvite') }}
        </UButton>
        <UButton
          v-if="locked"
          v-can="'user.update'"
          color="neutral"
          variant="outline"
          icon="i-lucide-lock-open"
          @click="run(`/users/${selected.id}/unlock`, undefined, t('admin.users.unlocked'))"
        >
          {{ t('admin.users.unlock') }}
        </UButton>
        <UButton
          v-if="selected.status !== 'disabled' && !isSelf"
          v-can="'user.set_password'"
          color="neutral"
          variant="outline"
          icon="i-lucide-key-round"
          @click="openPassword(selected)"
        >
          {{ t('admin.users.setTempPassword') }}
        </UButton>
        <UButton
          v-can="'user.manage_sessions'"
          color="neutral"
          variant="outline"
          icon="i-lucide-log-out"
          @click="revokeSessions(selected)"
        >
          {{ t('admin.users.revoke') }}
        </UButton>
        <UButton
          v-if="selected.status !== 'invited'"
          v-can="'user.update'"
          :color="selected.status === 'disabled' ? 'primary' : 'error'"
          variant="ghost"
          class="ms-auto"
          :icon="selected.status === 'disabled' ? 'i-lucide-user-check' : 'i-lucide-user-x'"
          @click="toggleDisabled(selected)"
        >
          {{ selected.status === 'disabled' ? t('admin.users.enable') : t('admin.users.disable') }}
        </UButton>
      </template>
      <template v-if="selected">
        <PlatformDrawerSection :title="t('admin.users.details')">
          <div v-if="nameEdit !== null" class="mb-3 flex gap-2">
            <UInput v-model="nameEdit" class="flex-1" autofocus @keydown.enter="saveName(selected)" />
            <UButton :loading="action.isPending.value" @click="saveName(selected)">{{
              t('platform.actions.save')
            }}</UButton>
            <UButton color="neutral" variant="ghost" @click="nameEdit = null">{{
              t('platform.actions.cancel')
            }}</UButton>
          </div>
          <div v-if="usernameEdit !== null" class="mb-3">
            <div class="flex gap-2">
              <UInput
                v-model="usernameEdit"
                class="flex-1"
                autofocus
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                :placeholder="t('admin.users.username')"
                :aria-label="t('admin.users.username')"
                :ui="{ base: 'font-mono' }"
                @keydown.enter="saveUsername(selected)"
              />
              <UButton :loading="action.isPending.value" @click="saveUsername(selected)">{{
                t('platform.actions.save')
              }}</UButton>
              <UButton color="neutral" variant="ghost" @click="usernameEdit = null">{{
                t('platform.actions.cancel')
              }}</UButton>
            </div>
            <p class="mt-1 text-[12px]" :class="usernameError ? 'text-[var(--app-bad)]' : 'muted'">
              {{ usernameError || t('admin.users.usernameHint') }}
            </p>
          </div>
          <div v-if="emailEdit !== null" class="mb-3">
            <div class="flex gap-2">
              <UInput
                v-model="emailEdit"
                type="email"
                class="flex-1"
                autofocus
                autocomplete="off"
                :placeholder="t('auth.fields.email')"
                :aria-label="t('auth.fields.email')"
                @keydown.enter="saveEmail(selected)"
              />
              <UButton :loading="action.isPending.value" @click="saveEmail(selected)">{{
                t('platform.actions.save')
              }}</UButton>
              <UButton color="neutral" variant="ghost" @click="emailEdit = null">{{
                t('platform.actions.cancel')
              }}</UButton>
            </div>
            <p class="mt-1 text-[12px]" :class="emailError ? 'text-[var(--app-bad)]' : 'muted'">
              {{
                emailError ||
                t(selected.status === 'invited' ? 'admin.users.emailHintInvited' : 'admin.users.emailHint')
              }}
            </p>
          </div>
          <PlatformKeyValue
            :items="[
              { label: t('admin.users.name'), value: selected.displayName, key: 'name' },
              { label: t('auth.fields.email'), value: selected.email ?? undefined, key: 'email' },
              { label: t('admin.users.username'), value: selected.username, key: 'username' },
              { label: t('admin.users.mfaRequired'), key: 'mfa' },
              { label: t('admin.users.mfaMethods'), key: 'mfaMethods' },
              ...(selected.passwordChangeRequired && selected.passwordExpiresAt
                ? [
                    {
                      label: t('admin.users.tempPassword'),
                      value: t('admin.users.tempExpires', { when: dateTime(selected.passwordExpiresAt) }),
                    },
                  ]
                : []),
              {
                label: t('admin.users.lastLogin'),
                value: selected.lastLoginAt ? dateTime(selected.lastLoginAt) : t('admin.users.never'),
              },
              { label: t('admin.users.created'), value: dateTime(selected.createdAt) },
            ]"
          >
            <template #name="{ item: kv }">
              <span class="inline-flex items-center gap-2">
                {{ kv.value }}
                <UButton
                  v-if="access.can('user.update')"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  :aria-label="t('platform.actions.edit')"
                  @click="nameEdit = selected.displayName"
                />
              </span>
            </template>
            <template #username="{ item: kv }">
              <span class="inline-flex items-center gap-2">
                <span v-if="kv.value" class="mono">{{ kv.value }}</span>
                <span v-else class="text-dimmed">{{ t('admin.users.noUsername') }}</span>
                <UButton
                  v-if="access.can('user.update')"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  :aria-label="t('admin.users.username') + ': ' + t('platform.actions.edit')"
                  @click="editUsername(selected)"
                />
              </span>
            </template>
            <template #email="{ item: kv }">
              <span class="inline-flex flex-wrap items-center gap-2">
                <span v-if="!kv.value" class="text-dimmed" data-testid="user-no-email">{{
                  t('admin.users.noEmail')
                }}</span>
                <template v-else>
                  {{ kv.value }}
                  <UBadge v-if="selected.emailVerified" color="success" variant="subtle" size="sm">{{
                    t('account.profile.verified')
                  }}</UBadge>
                  <UBadge v-else color="warning" variant="subtle" size="sm">{{
                    t('account.profile.unverified')
                  }}</UBadge>
                </template>
                <UButton
                  v-if="canEditEmail"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  :aria-label="t('auth.fields.email') + ': ' + t('platform.actions.edit')"
                  @click="editEmail(selected)"
                />
              </span>
            </template>
            <template #mfa>
              <USwitch
                :model-value="selected.mfaRequired"
                :disabled="!access.can('user.update') || action.isPending.value"
                :aria-label="t('admin.users.mfaRequired')"
                @update:model-value="
                  (v: boolean) =>
                    run(`/users/${selected!.id}`, { mfaRequired: v }, t('platform.toast.saved'), 'PATCH')
                "
              />
            </template>
            <template #mfaMethods>
              <span v-if="selected.mfaMethods.length" class="grid gap-1" data-testid="user-mfa-methods">
                <span class="inline-flex flex-wrap items-center gap-2">
                  <UBadge
                    v-for="m in selected.mfaMethods"
                    :key="m"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    {{ t(`auth.mfa.method.${m}`) }}
                  </UBadge>
                  <UButton
                    v-if="access.can('user.update') && !isSelf"
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-shield-off"
                    @click="resetMfa(selected)"
                  >
                    {{ t('admin.users.resetMfa') }}
                  </UButton>
                </span>
                <span class="text-[12px] text-[var(--app-muted)]">{{ t('admin.users.mfaAsked') }}</span>
              </span>
              <span v-else class="text-dimmed" data-testid="user-mfa-methods">{{
                t('admin.users.mfaNone')
              }}</span>
            </template>
          </PlatformKeyValue>
        </PlatformDrawerSection>
        <PlatformDrawerSection v-if="access.can('role.read')" :title="t('admin.users.access')">
          <PlatformAdminUserAccess :user-id="selected.id" />
        </PlatformDrawerSection>
      </template>
    </PlatformEntityDrawer>

    <PlatformAdminUserPasswordDialog v-model:open="passwordOpen" :user="passwordFor" />

    <UModal
      v-model:open="inviteOpen"
      :title="t('admin.users.inviteTitle')"
      :description="t('admin.users.inviteText')"
    >
      <template #body>
        <div v-if="inviteLink" class="grid gap-3">
          <UAlert
            color="info"
            variant="subtle"
            icon="i-lucide-flask-conical"
            :description="t('admin.users.devLink')"
          />
          <UInput :model-value="inviteLink" readonly class="w-full" :ui="{ base: 'font-mono text-xs' }" />
        </div>
        <form v-else id="invite-form" class="grid gap-4" novalidate @submit.prevent="sendInvite">
          <UAlert
            v-if="inviteErrors.message.value"
            color="error"
            variant="subtle"
            :description="inviteErrors.message.value"
          />
          <UFormField :label="t('auth.fields.email')" :error="inviteErrors.fields.email" required>
            <UInput v-model="invite.email" type="email" class="w-full" autofocus @blur="offerUsername" />
          </UFormField>
          <UFormField
            :label="t('admin.users.username')"
            :hint="t(usernameRequired ? 'admin.users.usernameHintRequired' : 'admin.users.usernameHint')"
            :error="inviteErrors.fields.username"
            :required="usernameRequired"
          >
            <UInput
              v-model="invite.username"
              name="new-username"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              class="w-full"
              :ui="{ base: 'font-mono' }"
            />
          </UFormField>
          <UFormField :label="t('admin.users.name')" :error="inviteErrors.fields.displayName" required>
            <UInput v-model="invite.displayName" class="w-full" />
          </UFormField>
          <UFormField :label="t('account.profile.locale')">
            <USelect
              v-model="invite.locale"
              :items="[
                { value: 'auto', label: t('admin.users.localeDefault') },
                ...locales.map((l) => ({ value: l.code, label: l.name ?? l.code })),
              ]"
              class="w-full"
            />
          </UFormField>
          <USwitch
            v-model="invite.mfaRequired"
            :label="t('admin.users.mfaRequired')"
            :description="t('admin.users.mfaRequiredHint')"
          />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <template v-if="inviteLink">
            <UButton @click="inviteOpen = false">{{ t('platform.actions.done') }}</UButton>
          </template>
          <template v-else>
            <UButton color="neutral" variant="ghost" @click="inviteOpen = false">{{
              t('platform.actions.cancel')
            }}</UButton>
            <UButton type="submit" form="invite-form" icon="i-lucide-send" :loading="inviteBusy">
              {{ t('admin.users.sendInvite') }}
            </UButton>
          </template>
        </div>
      </template>
    </UModal>
  </div>
</template>

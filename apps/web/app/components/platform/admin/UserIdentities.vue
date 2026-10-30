<script setup lang="ts">
import type { HandoffIdentity } from '../../../types/platform'

/** A user's portal accounts, with a form to link one (for people who had an account before the portal). */
const props = defineProps<{ userId: string }>()

const { t } = useI18n()
const dates = useDates()
const notify = useNotify()
const access = useAccess()
const action = useAdminAction()
const manifest = useManifest()
const hosts = computed(() => manifest.data.value?.handoff?.hosts ?? [])
const identities = useApiItem<HandoffIdentity[]>(
  ADMIN_KEY,
  () => `/auth/handoff/admin/users/${props.userId}/identities`,
)

const linking = ref(false)
const form = reactive({ host: '', externalId: '' })
const error = ref('')

function startLink() {
  Object.assign(form, { host: hosts.value[0]?.key ?? '', externalId: '' })
  error.value = ''
  linking.value = true
}

async function link() {
  error.value = ''
  if (!form.externalId.trim()) {
    error.value = t('handoff.admin.externalIdHint')
    return
  }
  try {
    await action.mutateAsync({
      path: `/auth/handoff/admin/users/${props.userId}/identities`,
      body: { host: form.host, externalId: form.externalId.trim() },
    })
    notify.success(t('handoff.admin.linked'))
    linking.value = false
  } catch (err) {
    if (isApiError(err) && err.status === 409) error.value = t('handoff.admin.linkTaken')
    else notify.error(err)
  }
}
</script>

<template>
  <div class="grid gap-3" data-testid="user-identities">
    <p v-if="!identities.data.value?.length" class="text-sm text-dimmed">
      {{ t('handoff.admin.noIdentities') }}
    </p>
    <ul v-else class="grid gap-2">
      <li v-for="row in identities.data.value" :key="row.id" class="text-sm">
        <span class="font-medium">{{ row.hostLabel }}</span>
        <span class="mono ms-2">{{ row.externalId }}</span>
        <span class="block text-xs text-dimmed">
          {{
            row.lastLoginAt
              ? t('handoff.admin.lastUsed', { date: dates.relative(row.lastLoginAt) })
              : t('handoff.admin.neverUsed')
          }}
        </span>
      </li>
    </ul>
    <template v-if="access.can('user.update') && access.can('user.set_password') && hosts.length">
      <form v-if="linking" class="grid gap-2" @submit.prevent="link">
        <p class="text-xs text-dimmed">{{ t('handoff.admin.linkText') }}</p>
        <USelect
          v-if="hosts.length > 1"
          v-model="form.host"
          :items="hosts.map((h) => ({ label: h.label, value: h.key }))"
          :aria-label="t('handoff.admin.host')"
        />
        <UInput
          v-model="form.externalId"
          :placeholder="t('handoff.admin.externalId')"
          :aria-label="t('handoff.admin.externalId')"
          :ui="{ base: 'font-mono' }"
        />
        <p v-if="error" class="text-xs text-error">{{ error }}</p>
        <div class="flex gap-2">
          <UButton type="submit" size="sm" :loading="action.isPending.value">{{
            t('handoff.admin.link')
          }}</UButton>
          <UButton size="sm" color="neutral" variant="ghost" @click="linking = false">
            {{ t('platform.actions.cancel') }}
          </UButton>
        </div>
      </form>
      <UButton v-else size="sm" color="neutral" variant="outline" icon="i-lucide-link" @click="startLink">
        {{ t('handoff.admin.link') }}
      </UButton>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Delegation } from '../../../types/approval'

/**
 * An out-of-office delegation: who, which record type, from when until when, why. Given `delegation`, it
 * edits that one: the delegate stays, and so does a start that has passed.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ delegation?: Delegation | null }>()
const { t } = useI18n()
const notify = useNotify()
const manifest = useManifest()
const entities = useApprovalEntityRegistry()
const { create, update } = useApprovalDelegations()
const { dayjs, dateTime } = useDates()
const timezone = useTimezone()
// datetime-local values carry no zone: read them in the user's preference, as `dateTime()` shows them.
const toTime = (value: string) => (value ? dayjs.tz(value, timezone.value).valueOf() : Number.NaN)

type Field = 'delegateId' | 'entityType' | 'startsAt' | 'endsAt' | 'reason'
const FIELDS: Field[] = ['delegateId', 'entityType', 'startsAt', 'endsAt', 'reason']
const errors = useFormErrors<Field>()
// Reka's select reserves the empty string, so "all record types" needs a value of its own.
const ALL = '*'
const YEAR_MS = 366 * 86_400_000
const blank = () => ({
  delegateId: undefined as string | undefined,
  entityType: ALL,
  startsAt: '',
  endsAt: '',
  reason: '',
})
const form = reactive(blank())
const types = computed(() => [
  { value: ALL, label: t('account.delegations.allTypes') },
  ...(manifest.data.value?.approvables ?? []).map((a) => ({ value: a.type, label: entities.label(a.type) })),
])

const editing = computed(() => props.delegation ?? null)
const started = computed(() => !!editing.value && new Date(editing.value.startsAt).getTime() <= Date.now())
const LOCAL = 'YYYY-MM-DDTHH:mm'

watch(open, (isOpen) => {
  if (!isOpen) return
  const d = editing.value
  Object.assign(
    form,
    d
      ? {
          delegateId: d.delegate.id,
          entityType: d.entityType ?? ALL,
          startsAt: dateTime(d.startsAt, LOCAL),
          endsAt: dateTime(d.endsAt, LOCAL),
          reason: d.reason ?? '',
        }
      : blank(),
  )
  errors.clear()
})

function check() {
  errors.clear()
  const start = started.value
    ? new Date(editing.value!.startsAt).getTime()
    : form.startsAt
      ? toTime(form.startsAt)
      : Date.now()
  const end = toTime(form.endsAt)
  if (!form.delegateId) errors.fields.delegateId = t('account.delegations.pickDelegate')
  if (Number.isNaN(end)) errors.fields.endsAt = t('account.delegations.endsRequired')
  else if (end <= Date.now()) errors.fields.endsAt = t('account.delegations.endsFuture')
  else if (end <= start) errors.fields.endsAt = t('account.delegations.endsAfterStart')
  else if (end - start > YEAR_MS) errors.fields.endsAt = t('account.delegations.maxYear')
  return !Object.keys(errors.fields).length
}

async function submit() {
  if (!check()) return
  try {
    if (editing.value) {
      await update.mutateAsync({
        id: editing.value.id,
        body: {
          entityType: form.entityType === ALL ? null : form.entityType,
          ...(!started.value && form.startsAt
            ? { startsAt: new Date(toTime(form.startsAt)).toISOString() }
            : {}),
          endsAt: new Date(toTime(form.endsAt)).toISOString(),
          reason: form.reason.trim() || null,
        },
      })
      notify.success(t('account.delegations.updated'))
      open.value = false
      return
    }
    await create.mutateAsync({
      delegateId: form.delegateId!,
      entityType: form.entityType === ALL ? null : form.entityType,
      ...(form.startsAt ? { startsAt: new Date(toTime(form.startsAt)).toISOString() } : {}),
      endsAt: new Date(toTime(form.endsAt)).toISOString(),
      reason: form.reason.trim() || null,
    })
    notify.success(t('account.delegations.created'))
    open.value = false
  } catch (error) {
    errors.apply(error, FIELDS)
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t(editing ? 'account.delegations.edit' : 'account.delegations.new')"
    :description="t('account.delegations.givenText')"
  >
    <template #body>
      <form id="delegation-form" class="grid gap-4" novalidate @submit.prevent="submit">
        <UFormField :label="t('approval.delegate.to')" :error="errors.fields.delegateId" required>
          <UInput
            v-if="editing"
            :model-value="editing.delegate.displayName"
            disabled
            class="w-full"
            data-testid="delegation-delegate"
          />
          <PlatformApprovalDelegatePicker
            v-else
            v-model="form.delegateId"
            :invalid="!!errors.fields.delegateId"
          />
        </UFormField>
        <UFormField :label="t('account.delegations.scope')" :error="errors.fields.entityType">
          <USelect v-model="form.entityType" :items="types" class="w-full" />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            :label="t('account.delegations.starts')"
            :hint="started ? undefined : t('account.delegations.startsHint')"
            :error="errors.fields.startsAt"
          >
            <UInput v-model="form.startsAt" type="datetime-local" class="w-full" :disabled="started" />
          </UFormField>
          <UFormField :label="t('account.delegations.ends')" :error="errors.fields.endsAt" required>
            <UInput v-model="form.endsAt" type="datetime-local" class="w-full" />
          </UFormField>
        </div>
        <UFormField :label="t('account.delegations.reason')" :error="errors.fields.reason">
          <UInput
            v-model="form.reason"
            :maxlength="500"
            :placeholder="t('account.delegations.reasonPlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UAlert v-if="errors.message.value" color="error" variant="subtle" :title="errors.message.value" />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          {{ t('platform.actions.cancel') }}
        </UButton>
        <UButton
          type="submit"
          form="delegation-form"
          icon="i-lucide-forward"
          :loading="create.isPending.value || update.isPending.value"
        >
          {{ t(editing ? 'platform.actions.save' : 'account.delegations.create') }}
        </UButton>
      </div>
    </template>
  </USlideover>
</template>

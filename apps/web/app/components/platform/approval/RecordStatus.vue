<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'
import { useQueryClient } from '@tanstack/vue-query'
import type { AvailableWorkflow } from '../../../types/approval'

const props = defineProps<{
  entityType: string
  entityId: string
  /** `POST` endpoint that submits the record, e.g. `/notes/{id}/submit`. */
  submitPath?: string
  /** Whether the record is in a state that can be submitted (e.g. a draft). */
  submittable?: boolean
}>()
const emit = defineEmits<{ submitted: [requestId: string] }>()
const { t } = useI18n()
const { relative, dateTime } = useDates()
const notify = useNotify()
const confirm = useConfirm()
const api = useApi()
const client = useQueryClient()

const requests = useEntityApprovals(props.entityType, () => props.entityId)
const latest = computed(() => requests.data.value?.[0])
// A returned request stays open: the submitter resubmits it from the request page.
const open = computed(() => latest.value?.status === 'pending' || latest.value?.status === 'returned')
const returned = computed(() => latest.value?.status === 'returned')
const canSubmit = computed(() => !!props.submitPath && props.submittable && !open.value)
const submitting = ref(false)
const choosing = ref(false)
const choices = ref<AvailableWorkflow[]>([])
const submitLabel = computed(() =>
  latest.value ? t('approval.record.submitAgain') : t('approval.record.submit'),
)

async function loadChoices() {
  const res = await api<DataResponse<AvailableWorkflow[]>>(
    `/approval/workflows/available?entityType=${encodeURIComponent(props.entityType)}`,
  )
  choices.value = res.data
  return res.data
}

async function send(workflow: string) {
  if (!props.submitPath) return
  submitting.value = true
  try {
    const res = await api<DataResponse<{ requestId: string }>>(props.submitPath, {
      method: 'POST',
      body: { workflow },
    })
    choosing.value = false
    await client.invalidateQueries({ queryKey: [APPROVAL_KEY] })
    notify.success(t('approval.record.submitted'))
    emit('submitted', res.data.requestId)
  } catch (error) {
    notify.error(error)
    // The workflow was deactivated or narrowed while the dialog was open: show the current list.
    const code = isApiError(error) ? error.code : undefined
    if (code === 'approval.workflow_unavailable' || code === 'approval.workflow_required') {
      const list = await loadChoices().catch(() => [])
      if (!list.length) choosing.value = false
    }
  } finally {
    submitting.value = false
  }
}

async function submit() {
  let list: AvailableWorkflow[]
  try {
    list = await loadChoices()
  } catch (error) {
    notify.error(error)
    return
  }
  if (!list.length) {
    notify.error(new Error(t('approval.record.noWorkflow')))
    return
  }
  if (list.length > 1) {
    choosing.value = true
    return
  }
  const ok = await confirm({
    title: t('approval.record.submitTitle'),
    description: `${t('approval.record.submitText')} ${t('approval.record.submitWith', { name: list[0]!.name })}`,
    confirmLabel: submitLabel.value,
  })
  if (ok) await send(list[0]!.key)
}
</script>

<template>
  <div class="rs">
    <span class="rs-ic" aria-hidden="true"><UIcon name="i-lucide-stamp" class="size-4" /></span>
    <div class="min-w-0 flex-1">
      <b class="block text-[13.5px]">{{ t('approval.record.title') }}</b>
      <USkeleton v-if="requests.isPending.value" class="mt-1 h-4 w-40" />
      <p v-else-if="latest" class="muted flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
        <PlatformStatusBadge
          :tone="REQUEST_STATUS_TONES[latest.status]"
          :label="t(`approval.status.${latest.status}`)"
        />
        <span>
          {{ t('approval.record.since', { when: relative(latest.completedAt ?? latest.submittedAt) }) }}
        </span>
        <span v-if="latest.round > 1">· {{ t('approval.round', { n: latest.round }) }}</span>
        <span class="sr-only">{{ dateTime(latest.completedAt ?? latest.submittedAt) }}</span>
      </p>
      <p v-else class="muted text-[12.5px]">{{ t('approval.record.none') }}</p>
    </div>
    <UButton
      v-if="latest"
      :to="`/approvals/${latest.id}`"
      :color="returned ? 'primary' : 'neutral'"
      :variant="returned ? 'solid' : 'ghost'"
      size="sm"
      trailing-icon="i-lucide-arrow-right"
    >
      {{ t('approval.record.open') }}
    </UButton>
    <UButton v-if="canSubmit" size="sm" icon="i-lucide-send" :loading="submitting" @click="submit">
      {{ submitLabel }}
    </UButton>
    <PlatformApprovalSubmitDialog
      v-model:open="choosing"
      :workflows="choices"
      :busy="submitting"
      :submit-label="submitLabel"
      @confirm="send"
    />
  </div>
</template>

<style scoped>
.rs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: var(--app-surface);
}
.rs-ic {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: color-mix(in oklab, var(--app-accent) 12%, transparent);
  color: var(--app-accent);
}
</style>

<script setup lang="ts">
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

const requests = useEntityApprovals(props.entityType, () => props.entityId)
const latest = computed(() => requests.data.value?.[0])
// A returned request stays open: the submitter resubmits it from the request page.
const open = computed(() => latest.value?.status === 'pending' || latest.value?.status === 'returned')
const returned = computed(() => latest.value?.status === 'returned')
const canSubmit = computed(() => !!props.submitPath && props.submittable && !open.value)
const submitLabel = computed(() =>
  latest.value ? t('approval.record.submitAgain') : t('approval.record.submit'),
)
const {
  submitting,
  choosing,
  choices,
  submit: startSubmit,
  confirmChoice,
} = useRecordSubmit(() => props.entityType)

async function submit() {
  if (!props.submitPath) return
  const requestId = await startSubmit(props.submitPath, { label: submitLabel.value })
  if (requestId) emit('submitted', requestId)
}
</script>

<template>
  <!-- Request search lists only one's own requests (or all with read_all): an approver of a record that is no longer
       submittable sees none, so the card hides rather than say "not submitted". -->
  <div v-if="requests.isPending.value || latest || submittable" class="rs">
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
      @confirm="confirmChoice"
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

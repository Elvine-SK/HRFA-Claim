<script setup lang="ts">
const props = defineProps<{ entity: string; params?: URLSearchParams; filtered?: boolean }>()
const { t } = useI18n()
const notify = useNotify()
const { entity: spec } = useTransferEntity(() => props.entity)
const actions = useTransferActions()

const jobId = ref<string | null>(null)
const starting = ref(false)
const job = useTransferJob(jobId)
const running = computed(
  () => starting.value || (!!jobId.value && !isTransferFinished(job.data.value?.status)),
)

async function start() {
  starting.value = true
  try {
    jobId.value = await actions.startExport(props.entity, props.params)
  } catch (error) {
    notify.error(error)
  } finally {
    starting.value = false
  }
}

watch(
  () => job.data.value?.status,
  async (status) => {
    if (!jobId.value || !status || !isTransferFinished(status)) return
    const data = job.data.value
    jobId.value = null
    if (status === 'dead') return notify.error(new Error(t('transfer.export.failed')))
    const result = exportResultOf(data)
    if (!result) return
    try {
      await actions.downloadFile(result.fileId, props.entity)
      notify.success(t('transfer.export.done', { n: result.rows }, result.rows))
      if (result.truncated) notify.info(t('transfer.export.truncated'))
    } catch (error) {
      notify.error(error)
    }
  },
)
watch(
  () => job.error.value,
  (error) => {
    if (error && jobId.value) {
      jobId.value = null
      notify.error(error)
    }
  },
)
</script>

<template>
  <UTooltip
    v-if="spec?.export"
    :text="filtered ? t('transfer.export.filteredHint') : t('transfer.export.allHint')"
  >
    <UButton color="neutral" variant="outline" icon="i-lucide-download" :loading="running" @click="start">
      {{ running ? t('transfer.export.running') : t('platform.actions.export') }}
    </UButton>
  </UTooltip>
</template>

<script setup lang="ts">
import type { UploadHandle } from '../../../composables/useUpload'
import type { Tone } from '../../../utils/tone'

/**
 * A file picked in this browser: "Ready" while it waits to be sent, progress and Cancel while uploading, the
 * reason with Retry or Dismiss when it failed or was refused, a check once it is up. Images show a thumbnail
 * from the local file at once.
 */
const props = defineProps<{
  name: string
  size: number
  type: string
  handle?: UploadHandle
  refused?: string
  /** Picked and not sent yet: the upload starts on a button or when the form saves. */
  staged?: boolean
  /** The picked file, for the thumbnail. */
  file?: File
  /** The upload is on the server and stays listed here (create forms): shows Remove, and Preview for images. */
  kept?: boolean
  disabled?: boolean
}>()
// `preview`: show the uploaded file (an image large, a PDF in a new tab).
const emit = defineEmits<{ dismiss: []; retry: []; remove: []; preview: [] }>()
const { t } = useI18n()

const kind = computed(() => fileKind(props.type))
const state = computed(() => {
  if (props.refused) return 'refused'
  if (props.staged && !props.handle) return 'ready'
  return props.handle?.state.value ?? 'uploading'
})
const problem = computed(() => {
  if (props.refused) return props.refused
  if (state.value === 'failed') return props.handle?.error.value?.message || t('files.failed')
  return null
})

const thumb = ref<string>()
onMounted(() => {
  if (props.file && isPreviewable(fileType(props.file))) thumb.value = URL.createObjectURL(props.file)
})
onBeforeUnmount(() => {
  if (thumb.value) URL.revokeObjectURL(thumb.value)
})
</script>

<template>
  <div
    class="file-row"
    :data-upload="kept ? undefined : name"
    :data-file="kept ? name : undefined"
    :data-state="state"
    :style="{ '--k': toneVar(kind.tone as Tone) }"
  >
    <button
      v-if="thumb && kept"
      type="button"
      class="file-kind cursor-zoom-in"
      :aria-label="t('files.preview', { name })"
      @click="emit('preview')"
    >
      <img :src="thumb" alt="" class="size-full object-cover" />
    </button>
    <button
      v-else-if="kept && isViewable(type)"
      type="button"
      class="file-kind cursor-pointer"
      :aria-label="t('files.open', { name })"
      :title="t('files.open', { name })"
      @click="emit('preview')"
    >
      {{ kind.label }}
    </button>
    <span v-else class="file-kind" :class="{ 'is-busy': state === 'uploading' && thumb }" aria-hidden="true">
      <img v-if="thumb" :src="thumb" alt="" class="size-full object-cover" />
      <template v-else>{{ kind.label }}</template>
    </span>
    <div class="min-w-0">
      <b class="block truncate">{{ name }}</b>
      <small v-if="problem" class="text-[var(--app-bad)]" role="alert">{{ problem }}</small>
      <UProgress
        v-else-if="state === 'uploading'"
        :model-value="handle?.progress.value ?? 0"
        size="xs"
        class="mt-1.5"
        :aria-label="name"
      />
      <small v-else-if="state === 'ready'">{{ t('files.ready') }}</small>
      <small v-else-if="state === 'done'" class="upload-done">
        <UIcon name="i-lucide-check" class="size-3.5" />
        {{ t('files.uploaded') }}
      </small>
    </div>
    <span class="mono muted">{{ formatBytes(size) }}</span>
    <div class="flex items-center">
      <UButton
        v-if="state === 'failed'"
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-rotate-cw"
        :aria-label="t('files.retry', { name })"
        @click="emit('retry')"
      />
      <UButton
        v-if="state === 'uploading'"
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        :aria-label="t('files.cancel', { name })"
        @click="handle?.cancel()"
      />
      <UButton
        v-else-if="problem || state === 'ready'"
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        :disabled="state === 'ready' && disabled"
        :aria-label="problem ? t('files.dismiss') : t('files.remove', { name })"
        @click="emit('dismiss')"
      />
      <UButton
        v-else-if="kept"
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        :disabled="disabled"
        :aria-label="t('files.remove', { name })"
        @click="emit('remove')"
      />
      <span v-else class="size-8" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.file-kind.is-busy img {
  opacity: 0.55;
}
.file-row .upload-done {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--app-ok);
  animation: upload-done-in 0.25s ease-out;
}
@keyframes upload-done-in {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(2px);
  }
}
</style>

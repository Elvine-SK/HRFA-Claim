<script setup lang="ts">
import { FILES_KEY, type UploadHandle } from '../../../composables/useUpload'
import type { FileLimits, FileMeta } from '../../../types/platform'

/**
 * Files for a record that does not exist yet, inside its create form. Each file is uploaded as a draft for
 * `entityType`; the form sends the ids (`v-model`) with the record and the API attaches them
 * (`FileService.attachAll`). Drafts that are never attached are purged after 24 hours.
 *
 * `upload` says when the files go to the server:
 * - `confirm` (default): picked files wait in the list until the person presses Upload.
 * - `submit`: nothing is sent until the form saves. The form calls `uploadAll()` (template ref) first and
 *   sends the ids it resolves to; `null` means a file failed and the form should not save.
 * - `auto`: each file is sent as soon as it is picked.
 */
const props = withDefaults(
  defineProps<{ entityType: string; disabled?: boolean; upload?: 'confirm' | 'submit' | 'auto' }>(),
  { upload: 'confirm' },
)
const ids = defineModel<string[]>({ default: () => [] })
const emit = defineEmits<{ uploading: [busy: boolean] }>()
const { t } = useI18n()
const api = useApi()
const notify = useNotify()
const uploader = useUpload()
const apiBase = useRuntimeConfig().public.platform.apiBase

const limitsQuery = useApiItem<FileLimits>(
  FILES_KEY,
  () => `/files/limits?entityType=${encodeURIComponent(props.entityType)}`,
  { staleTime: 5 * 60_000 },
)
const limits = computed(() => limitsQuery.data.value ?? { maxBytes: 0, accept: [] })
const ready = computed(() => !!limitsQuery.data.value && !props.disabled)

interface Entry {
  id: number
  /** The picked file: its thumbnail, and what a retry sends again. */
  source: File
  handle?: UploadHandle
  refused?: string
  /** Set once the upload is on the server. */
  file?: FileMeta
}
/** Picked, allowed and not sent yet (or failed): what Upload or the form's save still has to send. */
const waiting = (e: Entry) => !e.file && !e.refused && (!e.handle || e.handle.state.value === 'failed')
// Shallow: each upload handle keeps its own refs.
const entries = shallowRef<Entry[]>([])
let nextId = 0
const drop = (id: number) => (entries.value = entries.value.filter((e) => e.id !== id))
const patch = (id: number, change: Partial<Entry>) =>
  (entries.value = entries.value.map((e) => (e.id === id ? { ...e, ...change } : e)))
const sync = () => (ids.value = entries.value.flatMap((e) => (e.file ? [e.file.id] : [])))

const uploadingCount = computed(
  () => entries.value.filter((e) => !e.file && e.handle?.state.value === 'uploading').length,
)
watch(
  () => uploadingCount.value > 0,
  (busy) => emit('uploading', busy),
)
const kept = computed(() => entries.value.flatMap((e) => (e.file ? [e.file] : [])))
const keptBytes = computed(() => kept.value.reduce((sum, f) => sum + f.size, 0))
const staged = computed(() => entries.value.filter((e) => !e.file && !e.refused && !e.handle))
const stagedBytes = computed(() => staged.value.reduce((sum, e) => sum + e.source.size, 0))

function begin(id: number, source: File) {
  const handle = uploader.start(source, { entityType: props.entityType })
  patch(id, { handle })
  void handle.done.then((uploaded) => {
    if (uploaded) {
      patch(id, { file: uploaded })
      sync()
    } else if (handle.state.value === 'cancelled') drop(id)
  })
}

function addFiles(files: FileList | File[]) {
  for (const source of Array.from(files)) {
    const id = nextId++
    const reason = checkFile(source, limits.value)
    const refused = reason
      ? t(`files.refused.${reason}`, { max: formatBytes(limits.value.maxBytes) })
      : undefined
    entries.value = [...entries.value, { id, source, refused }]
    if (!refused && props.upload === 'auto') begin(id, source)
  }
}

/**
 * Sends every file still waiting and resolves once none is on its way: the ids of all uploaded files, or
 * `null` when one failed (its row says why and offers Retry).
 */
async function uploadAll(): Promise<string[] | null> {
  for (const e of entries.value) if (waiting(e)) begin(e.id, e.source)
  await Promise.all(entries.value.flatMap((e) => (e.handle && !e.file ? [e.handle.done] : [])))
  return entries.value.some(waiting) ? null : ids.value
}
defineExpose({ uploadAll })

async function remove(entry: Entry) {
  try {
    await api(`/files/${entry.file!.id}`, { method: 'DELETE' })
    drop(entry.id)
    sync()
  } catch (error) {
    notify.error(error)
  }
}

const picker = useTemplateRef<HTMLInputElement>('picker')
function pick(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) addFiles(input.files)
  input.value = ''
}

const root = useTemplateRef<HTMLElement>('root')
const dragging = ref(false)
function dragLeave(event: DragEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) dragging.value = false
}
function onDrop(event: DragEvent) {
  dragging.value = false
  if (ready.value && event.dataTransfer?.files.length) addFiles(event.dataTransfer.files)
}

const previewing = ref<FileMeta | null>(null)
const previewOpen = computed({
  get: () => !!previewing.value,
  set: (v: boolean) => {
    if (!v) previewing.value = null
  },
})
const contentSrc = (f: FileMeta) => `${apiBase}/files/${f.id}/content`
function show(f: FileMeta) {
  if (isViewable(f.contentType)) window.open(`${contentSrc(f)}?inline=1`, '_blank', 'noopener')
  else previewing.value = f
}
</script>

<template>
  <div
    ref="root"
    class="draft-files"
    data-testid="draft-attachments"
    @dragenter.prevent="ready && (dragging = true)"
    @dragover.prevent
    @dragleave="dragLeave"
    @drop.prevent="onDrop"
  >
    <div class="mb-2.5 flex items-center gap-2">
      <UIcon name="i-lucide-paperclip" class="size-4 text-[var(--app-muted)]" />
      <span class="text-sm font-medium">{{ t('files.title') }}</span>
      <span v-if="ids.length" class="mono muted text-xs font-medium">{{ ids.length }}</span>
      <span class="ms-auto text-xs text-muted">{{
        upload === 'submit' ? t('files.submitNote') : t('files.draftNote')
      }}</span>
    </div>

    <p v-if="limitsQuery.isError.value" class="mb-2 text-sm text-[var(--app-bad)]" role="alert">
      {{ limitsQuery.error.value?.message || t('platform.errors.generic') }}
    </p>
    <PlatformFilesDropArea
      :accept="limits.accept"
      :max-bytes="limits.maxBytes"
      :compact="entries.length > 0"
      :active="dragging"
      :disabled="!ready"
      @pick="picker?.click()"
    />
    <input
      ref="picker"
      type="file"
      multiple
      class="hidden"
      :accept="limits.accept.join(',')"
      data-testid="draft-file-input"
      @change="pick"
    />

    <TransitionGroup name="file-list" tag="div">
      <PlatformFilesUploadRow
        v-for="e in entries"
        :key="e.id"
        :name="e.file?.filename ?? e.source.name"
        :size="e.file?.size ?? e.source.size"
        :type="e.file?.contentType ?? fileType(e.source)"
        :file="e.source"
        :handle="e.handle"
        :refused="e.refused"
        :staged="upload !== 'auto'"
        :kept="!!e.file"
        :disabled="disabled"
        @dismiss="drop(e.id)"
        @retry="begin(e.id, e.source)"
        @remove="remove(e)"
        @preview="e.file && show(e.file)"
      />
    </TransitionGroup>

    <div v-if="entries.length" class="mt-2 flex min-h-7 items-center gap-2">
      <p class="text-xs text-muted" aria-live="polite" data-testid="files-summary">
        <template v-if="uploadingCount">{{
          t('files.uploading', { n: uploadingCount }, uploadingCount)
        }}</template>
        <template v-else-if="staged.length">
          {{ t('files.readySummary', { n: staged.length, size: formatBytes(stagedBytes) }, staged.length) }}
        </template>
        <template v-else-if="kept.length">
          {{ t('files.summary', { n: kept.length, size: formatBytes(keptBytes) }, kept.length) }}
        </template>
      </p>
      <UButton
        v-if="upload === 'confirm' && staged.length"
        class="ms-auto"
        size="sm"
        icon="i-lucide-upload"
        :disabled="disabled"
        :label="t('files.uploadN', { n: staged.length }, staged.length)"
        data-testid="files-upload"
        @click="uploadAll()"
      />
    </div>

    <PlatformFilesImagePreview
      v-if="previewing"
      v-model:open="previewOpen"
      :file="previewing"
      :src="`${contentSrc(previewing)}?inline=1`"
      :download-src="contentSrc(previewing)"
    />
  </div>
</template>

<style scoped>
.draft-files {
  padding: 14px 16px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-sm);
}
</style>

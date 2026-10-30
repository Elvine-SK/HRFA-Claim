<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { useIntersectionObserver } from '@vueuse/core'
import { FILES_KEY, type UploadHandle } from '../../../composables/useUpload'
import type { FileListMeta, FileMeta } from '../../../types/platform'
import type { Tone } from '../../../utils/tone'

/**
 * The files of one record: list, download, preview, delete, and upload by picking or drag and drop with
 * progress. Limits come from the server (`GET /files` meta) and are checked before anything is sent.
 * `upload`: `confirm` (default) keeps picked files in the list until the person presses Upload; `auto` sends
 * each as soon as it is picked. `locked` hides delete when the record keeps its files (the uploader may otherwise
 * always delete their own).
 */
const props = withDefaults(
  defineProps<{ entityType: string; entityId: string; upload?: 'confirm' | 'auto'; locked?: boolean }>(),
  { upload: 'confirm', locked: false },
)
const emit = defineEmits<{ count: [n: number] }>()
const { t } = useI18n()
const api = useApi()
const notify = useNotify()
const confirm = useConfirm()
const { relative } = useDates()
const uploader = useUpload()
const queryClient = useQueryClient()
const apiBase = useRuntimeConfig().public.platform.apiBase

const list = useInfiniteList<FileMeta>(FILES_KEY, '/files', {
  params: () => ({ entityType: props.entityType, entityId: props.entityId }),
  pageSize: 50,
})
const meta = computed(() => list.data.value?.pages[0]?.meta as FileListMeta | undefined)
const canAttach = computed(() => meta.value?.canAttach ?? false)
const limits = computed(() => ({ maxBytes: meta.value?.maxBytes ?? 0, accept: meta.value?.accept ?? [] }))
watch(list.total, (n) => emit('count', n), { immediate: true })

const invalidate = () => queryClient.invalidateQueries({ queryKey: [FILES_KEY] })
const contentSrc = (f: FileMeta) => `${apiBase}/files/${f.id}/content`
const inlineSrc = (f: FileMeta) => `${contentSrc(f)}?inline=1`

interface Pending {
  id: number
  /** The picked file: its thumbnail, and what a retry sends again. */
  source: File
  handle?: UploadHandle
  refused?: string
}
// Shallow: each upload handle keeps its own refs.
const pending = shallowRef<Pending[]>([])
let nextId = 0
const removePending = (id: number) => (pending.value = pending.value.filter((p) => p.id !== id))
const uploadingCount = computed(
  () => pending.value.filter((p) => p.handle?.state.value === 'uploading').length,
)
const staged = computed(() => pending.value.filter((p) => !p.refused && !p.handle))
const stagedBytes = computed(() => staged.value.reduce((sum, p) => sum + p.source.size, 0))
const uploadStaged = () => staged.value.forEach((p) => begin(p.id, p.source))

function begin(id: number, source: File) {
  const handle = uploader.start(source, { entityType: props.entityType, entityId: props.entityId })
  pending.value = pending.value.map((p) => (p.id === id ? { ...p, handle } : p))
  void handle.done.then((ok) => {
    // The pending row gives way once the list has the uploaded file.
    if (ok) void invalidate().finally(() => removePending(id))
    else if (handle.state.value === 'cancelled') removePending(id)
  })
}

function addFiles(files: FileList | File[]) {
  for (const source of Array.from(files)) {
    const id = nextId++
    const reason = checkFile(source, limits.value)
    const refused = reason
      ? t(`files.refused.${reason}`, { max: formatBytes(limits.value.maxBytes) })
      : undefined
    pending.value = [...pending.value, { id, source, refused }]
    if (!refused && props.upload === 'auto') begin(id, source)
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
function drop(event: DragEvent) {
  dragging.value = false
  if (canAttach.value && event.dataTransfer?.files.length) addFiles(event.dataTransfer.files)
}

async function remove(f: FileMeta) {
  const ok = await confirm({
    title: t('files.deleteTitle'),
    description: t('files.deleteText', { name: f.filename }),
    confirmLabel: t('platform.actions.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/files/${f.id}`, { method: 'DELETE' })
    notify.success(t('files.deleted', { name: f.filename }))
    await invalidate()
  } catch (error) {
    notify.error(error)
  }
}

const previewing = ref<FileMeta | null>(null)
const previewOpen = computed({
  get: () => !!previewing.value,
  set: (v: boolean) => {
    if (!v) previewing.value = null
  },
})

const sentinel = useTemplateRef<HTMLElement>('sentinel')
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) list.loadMore()
})
</script>

<template>
  <section
    ref="root"
    class="card"
    data-testid="attachments"
    @dragenter.prevent="canAttach && (dragging = true)"
    @dragover.prevent
    @dragleave="dragLeave"
    @drop.prevent="drop"
  >
    <header class="card-h">
      <h2 class="flex items-center gap-2">
        <UIcon name="i-lucide-paperclip" class="size-4 text-[var(--app-muted)]" />
        {{ t('files.title') }}
        <span v-if="list.total.value" class="mono muted text-xs font-medium">{{ list.total.value }}</span>
      </h2>
      <span v-if="uploadingCount" class="ms-auto text-xs text-muted" aria-live="polite">
        {{ t('files.uploading', { n: uploadingCount }, uploadingCount) }}
      </span>
      <input
        ref="picker"
        type="file"
        multiple
        class="hidden"
        :accept="limits.accept.join(',')"
        data-testid="file-input"
        @change="pick"
      />
    </header>

    <div class="card-b">
      <div v-if="list.isPending.value" class="grid gap-3" aria-busy="true">
        <USkeleton v-for="n in 3" :key="n" class="h-10 w-full" />
      </div>
      <div v-else-if="list.isError.value" class="flex flex-col items-start gap-2" role="alert">
        <p class="text-sm text-muted">{{ list.error.value?.message || t('platform.errors.generic') }}</p>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-rotate-cw"
          @click="list.refetch()"
        >
          {{ t('platform.actions.retry') }}
        </UButton>
      </div>
      <template v-else>
        <PlatformFilesDropArea
          v-if="canAttach"
          :accept="limits.accept"
          :max-bytes="limits.maxBytes"
          :compact="list.rows.value.length + pending.length > 0"
          :active="dragging"
          @pick="picker?.click()"
        />
        <PlatformEmptyState
          v-else-if="!list.rows.value.length"
          icon="i-lucide-paperclip"
          :title="t('files.empty')"
        />
        <div v-if="staged.length" class="mt-2 flex items-center gap-2" data-testid="files-staged">
          <p class="text-xs text-muted" aria-live="polite">
            {{ t('files.readySummary', { n: staged.length, size: formatBytes(stagedBytes) }, staged.length) }}
          </p>
          <UButton
            class="ms-auto"
            size="sm"
            color="neutral"
            variant="ghost"
            :label="t('files.clear')"
            @click="pending = pending.filter((p) => p.handle || p.refused)"
          />
          <UButton
            size="sm"
            icon="i-lucide-upload"
            :label="t('files.uploadN', { n: staged.length }, staged.length)"
            data-testid="files-upload"
            @click="uploadStaged"
          />
        </div>
        <TransitionGroup name="file-list" tag="div">
          <PlatformFilesUploadRow
            v-for="p in pending"
            :key="`up-${p.id}`"
            :name="p.source.name"
            :size="p.source.size"
            :type="fileType(p.source)"
            :file="p.source"
            :handle="p.handle"
            :refused="p.refused"
            :staged="upload !== 'auto'"
            @dismiss="removePending(p.id)"
            @retry="begin(p.id, p.source)"
          />
          <div
            v-for="f in list.rows.value"
            :key="f.id"
            class="file-row"
            :data-file="f.filename"
            :style="{ '--k': toneVar(fileKind(f.contentType).tone as Tone) }"
          >
            <PlatformFilesFileThumb :file="f" @preview="previewing = f" />
            <div class="min-w-0">
              <b class="block truncate">{{ f.filename }}</b>
              <small class="truncate">
                {{
                  t('files.by', {
                    name: f.createdByName ?? t('files.unknownUser'),
                    when: relative(f.createdAt),
                  })
                }}
              </small>
            </div>
            <span class="mono muted">{{ formatBytes(f.size) }}</span>
            <div class="flex items-center">
              <UButton
                :to="contentSrc(f)"
                external
                download
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-download"
                :aria-label="t('files.download', { name: f.filename })"
              />
              <UButton
                v-if="f.canDelete && !locked"
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-trash-2"
                :aria-label="t('files.delete', { name: f.filename })"
                @click="remove(f)"
              />
            </div>
          </div>
        </TransitionGroup>
        <div ref="sentinel" aria-hidden="true" />
      </template>
    </div>

    <PlatformFilesImagePreview
      v-if="previewing"
      v-model:open="previewOpen"
      :file="previewing"
      :src="inlineSrc(previewing)"
      :download-src="contentSrc(previewing)"
    />
  </section>
</template>

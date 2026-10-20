<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { FILES_KEY } from '../../../composables/useUpload'
import type { MyFile } from '../../../types/platform'
import type { DataTableColumn } from '../DataTable.vue'

/** Files across records: every file (`/files/all`, `file.read_all`) or the caller's uploads (`/files/mine`). */
const props = defineProps<{ source: '/files/all' | '/files/mine'; admin: boolean }>()
// `available` comes only from `/files/mine`.
type Row = Omit<MyFile, 'available'> & { available?: boolean }

const { t, te } = useI18n()
const { dateTime, relative } = useDates()
const api = useApi()
const notify = useNotify()
const confirm = useConfirm()
const manifest = useManifest()
const queryClient = useQueryClient()
const apiBase = useRuntimeConfig().public.platform.apiBase

const list = useListQuery({ defaults: { sort: [{ field: 'createdAt', dir: 'desc' }], pageSize: 50 } })
const rows = useApiList<Row>(FILES_KEY, () => props.source, list)

const entities = computed(() => manifest.data.value?.fileEntities ?? [])
const labelOf = (label: string) => (te(label) ? t(label) : label)
const entityOf = (type: string | null) => entities.value.find((e) => e.type === type)
const recordLink = (row: Row) => {
  const link = entityOf(row.entityType)?.link
  return link && row.entityId ? link.replace(':id', encodeURIComponent(row.entityId)) : null
}
const contentSrc = (row: Row) => `${apiBase}/files/${row.id}/content`

const previewing = ref<Row | null>(null)
const previewOpen = computed({
  get: () => !!previewing.value,
  set: (v: boolean) => {
    if (!v) previewing.value = null
  },
})

const columns = computed<DataTableColumn<Row>[]>(() => [
  { key: 'filename', label: t('files.columns.file'), sortable: true, primary: true, locked: true },
  { key: 'size', label: t('files.columns.size'), sortable: true, mono: true, align: 'end', card: true },
  { key: 'record', label: t('files.columns.record'), card: true, value: (r) => r.entityType },
  ...(props.admin
    ? [{ key: 'createdByName', label: t('files.columns.uploader'), card: true } as DataTableColumn<Row>]
    : []),
  { key: 'createdAt', label: t('files.columns.uploaded'), sortable: true },
  { key: 'actions', label: '', locked: true, align: 'end' },
])

const KINDS = ['all', 'image', 'document', 'other'] as const
const kind = computed({
  get: () => {
    const inTypes = list.filterValue('contentType', 'in') as string[] | undefined
    if (list.filterValue('contentType', 'nin')) return 'other'
    if (inTypes?.includes(FILE_KIND_TYPES.image[0]!)) return 'image'
    if (inTypes?.length) return 'document'
    return 'all'
  },
  set: async (v: (typeof KINDS)[number]) => {
    await list.setFilter(
      'contentType',
      'in',
      v === 'image' || v === 'document' ? FILE_KIND_TYPES[v] : undefined,
    )
    await list.setFilter(
      'contentType',
      'nin',
      v === 'other' ? [...FILE_KIND_TYPES.image, ...FILE_KIND_TYPES.document] : undefined,
    )
  },
})

const NOT_ATTACHED = '__none'
const record = computed({
  get: () =>
    list.filterValue('entityType', 'isNull')
      ? NOT_ATTACHED
      : ((list.filterValue('entityType', 'eq') as string | undefined) ?? 'all'),
  set: async (v: string) => {
    await list.setFilter('entityType', 'isNull', v === NOT_ATTACHED ? true : undefined)
    await list.setFilter('entityType', 'eq', v === 'all' || v === NOT_ATTACHED ? undefined : v)
  },
})

// The two selects above the table own the type and the record; the filter bar has the rest.
const filterLabels = computed(() => ({
  filename: t('files.columns.file'),
  size: t('files.sizeBytes'),
  ...(props.admin ? { createdBy: t('files.columns.uploader') } : {}),
  createdAt: t('files.columns.uploaded'),
}))

async function remove(row: Row) {
  const ok = await confirm({
    title: t('files.deleteTitle'),
    description: t('files.deleteText', { name: row.filename }),
    confirmLabel: t('platform.actions.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/files/${row.id}`, { method: 'DELETE' })
    notify.success(t('files.deleted', { name: row.filename }))
    await queryClient.invalidateQueries({ queryKey: [FILES_KEY] })
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <div data-testid="file-table">
    <div class="filters">
      <USelect
        v-model="kind"
        :items="KINDS.map((k) => ({ value: k, label: t(`files.kinds.${k}`) }))"
        class="w-40"
        :aria-label="t('files.columns.file')"
      />
      <USelect
        v-model="record"
        :items="[
          { value: 'all', label: t('files.allRecords') },
          ...entities.map((e) => ({ value: e.type, label: labelOf(e.label) })),
          { value: NOT_ATTACHED, label: t('files.notAttached') },
        ]"
        class="w-44"
        :aria-label="t('files.columns.record')"
      />
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        :id="admin ? 'admin-files' : 'my-files'"
        :rows="rows.data.value?.data ?? []"
        :total="rows.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="files"
        :filter-labels="filterLabels"
        :filter-user-fields="['createdBy']"
        :filter-hide="['contentType', 'entityType']"
        :loading="rows.isPending.value"
        :fetching="rows.isFetching.value"
        :error="rows.error.value"
        :entities="admin ? t('files.admin.entities') : t('files.mine.entities')"
        :caption="admin ? t('files.admin.title') : t('files.mine.title')"
        @retry="rows.refetch()"
      >
        <template #cell-filename="{ row, q }">
          <span class="inline-flex min-w-0 items-center gap-3" :data-file="row.filename">
            <PlatformFilesFileThumb
              :file="row"
              :available="row.available !== false"
              small
              @preview="previewing = row"
            />
            <span class="truncate font-semibold"><PlatformHighlight :text="row.filename" :query="q" /></span>
            <UBadge v-if="row.available === false" color="warning" variant="subtle" size="sm">
              {{ t('files.unavailable') }}
            </UBadge>
          </span>
        </template>
        <template #cell-size="{ row }">{{ formatBytes(row.size) }}</template>
        <template #cell-record="{ row }">
          <template v-if="row.entityType">
            <NuxtLink v-if="recordLink(row) && row.available !== false" :to="recordLink(row)!" class="link">
              {{ labelOf(entityOf(row.entityType)?.label ?? row.entityType) }}
            </NuxtLink>
            <span v-else>{{ labelOf(entityOf(row.entityType)?.label ?? row.entityType) }}</span>
          </template>
          <UBadge v-else color="neutral" variant="subtle" size="sm">{{ t('files.notAttached') }}</UBadge>
        </template>
        <template #cell-createdByName="{ row }">
          <span class="inline-flex min-w-0 items-center gap-2">
            <PlatformUserAvatar :name="row.createdByName ?? '?'" :seed="row.createdBy" size="xs" />
            <span class="truncate">{{ row.createdByName ?? t('files.unknownUser') }}</span>
          </span>
        </template>
        <template #cell-createdAt="{ row }">
          <UTooltip :text="dateTime(row.createdAt)">
            <time :datetime="row.createdAt" class="whitespace-nowrap">{{ relative(row.createdAt) }}</time>
          </UTooltip>
        </template>
        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end" @click.stop>
            <UButton
              v-if="row.available !== false"
              :to="contentSrc(row)"
              external
              download
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-download"
              :aria-label="t('files.download', { name: row.filename })"
            />
            <UButton
              v-if="recordLink(row) && row.available !== false"
              :to="recordLink(row)!"
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-up-right"
              :aria-label="t('files.openRecord')"
            />
            <UButton
              v-if="row.canDelete"
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              :aria-label="t('files.delete', { name: row.filename })"
              @click="remove(row)"
            />
          </div>
        </template>
      </PlatformDataTable>
    </UCard>

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
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.link {
  color: var(--app-accent);
}
.link:hover {
  text-decoration: underline;
}
</style>

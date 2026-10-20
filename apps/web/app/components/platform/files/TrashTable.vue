<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { FILES_KEY } from '../../../composables/useUpload'
import type { TrashedFile } from '../../../types/platform'
import type { Tone } from '../../../utils/tone'
import type { DataTableColumn } from '../DataTable.vue'

/**
 * Deleted files waiting for the purge. Every one (`/files/trash`, `file.manage`): restore, remove one for
 * good, or empty the trash, the last two after typing the confirmation word. Or the caller's own deletes of
 * their own uploads (`/files/mine/trash`): restore only. Their content is no longer served, so no preview.
 */
const props = defineProps<{ source: '/files/trash' | '/files/mine/trash'; admin: boolean }>()

const { t, te } = useI18n()
const { dateTime, relative } = useDates()
const api = useApi()
const notify = useNotify()
const confirm = useConfirm()
const manifest = useManifest()
const queryClient = useQueryClient()

const list = useListQuery({ defaults: { sort: [{ field: 'deletedAt', dir: 'desc' }], pageSize: 50 } })
const rows = useApiList<TrashedFile>(FILES_KEY, () => props.source, list)
const total = computed(() => rows.data.value?.meta.total ?? 0)

const labelOf = (label: string) => (te(label) ? t(label) : label)
const recordLabel = (type: string) =>
  labelOf(manifest.data.value?.fileEntities?.find((e) => e.type === type)?.label ?? type)

const columns = computed<DataTableColumn<TrashedFile>[]>(() => [
  { key: 'filename', label: t('files.columns.file'), sortable: true, primary: true, locked: true },
  { key: 'size', label: t('files.columns.size'), sortable: true, mono: true, align: 'end', card: true },
  { key: 'record', label: t('files.columns.record'), card: true, value: (r) => r.entityType },
  ...(props.admin
    ? [
        {
          key: 'deletedByName',
          label: t('files.trash.deletedBy'),
          card: true,
        } as DataTableColumn<TrashedFile>,
      ]
    : []),
  { key: 'deletedAt', label: t('files.trash.deleted'), sortable: true },
  { key: 'purgeAt', label: t('files.trash.purgeAt'), card: true },
  { key: 'actions', label: '', locked: true, align: 'end' },
])

const refresh = () => queryClient.invalidateQueries({ queryKey: [FILES_KEY] })

async function restore(row: TrashedFile) {
  try {
    await api(`/files/${row.id}/restore`, { method: 'POST' })
    notify.success(t('files.trash.restored', { name: row.filename }))
    await refresh()
  } catch (error) {
    notify.error(error)
  }
}

async function destroy(row: TrashedFile) {
  const ok = await confirm({
    title: t('files.trash.destroyTitle'),
    description: t('files.trash.destroyText', { name: row.filename }),
    confirmLabel: t('files.trash.destroy'),
    danger: true,
    typeToConfirm: t('files.trash.word'),
  })
  if (!ok) return
  try {
    await api(`/files/${row.id}/permanent`, { method: 'DELETE' })
    notify.success(t('files.trash.destroyed', { name: row.filename }))
    await refresh()
  } catch (error) {
    notify.error(error)
  }
}

const emptying = ref(false)
async function empty() {
  const ok = await confirm({
    title: t('files.trash.emptyTitle'),
    description: t('files.trash.emptyText', { n: total.value }, total.value),
    confirmLabel: t('files.trash.empty'),
    danger: true,
    typeToConfirm: t('files.trash.word'),
  })
  if (!ok) return
  emptying.value = true
  try {
    const { data } = await api<{ data: { deleted: number; failed: number } }>('/files/trash', {
      method: 'DELETE',
    })
    if (data.failed) notify.error(new Error(t('files.trash.emptyFailed', { n: data.failed }, data.failed)))
    else notify.success(t('files.trash.emptied', { n: data.deleted }, data.deleted))
    await refresh()
  } catch (error) {
    notify.error(error)
  } finally {
    emptying.value = false
  }
}
</script>

<template>
  <div data-testid="file-trash">
    <p class="mb-3 text-[13px] text-muted">{{ t(admin ? 'files.trash.hint' : 'files.trash.hintMine') }}</p>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        :id="admin ? 'admin-files-trash' : 'my-files-trash'"
        :rows="rows.data.value?.data ?? []"
        :total="total"
        :columns="columns"
        :list="list"
        :loading="rows.isPending.value"
        :fetching="rows.isFetching.value"
        :error="rows.error.value"
        :entities="t('files.trash.entities')"
        :caption="t('files.trash.title')"
        @retry="rows.refetch()"
      >
        <template v-if="admin && total" #toolbar-end>
          <UButton
            color="error"
            variant="outline"
            icon="i-lucide-trash-2"
            :loading="emptying"
            data-testid="empty-trash"
            @click="empty"
          >
            {{ t('files.trash.empty') }}
          </UButton>
        </template>
        <template #cell-filename="{ row, q }">
          <span class="inline-flex min-w-0 items-center gap-3" :data-file="row.filename">
            <span
              class="file-kind !size-8 !text-[9px]"
              :style="{ '--k': toneVar(fileKind(row.contentType).tone as Tone) }"
              aria-hidden="true"
              >{{ fileKind(row.contentType).label }}</span
            >
            <span class="truncate font-semibold"><PlatformHighlight :text="row.filename" :query="q" /></span>
          </span>
        </template>
        <template #cell-size="{ row }">{{ formatBytes(row.size) }}</template>
        <template #cell-record="{ row }">
          <span v-if="row.entityType">{{ recordLabel(row.entityType) }}</span>
          <UBadge v-else color="neutral" variant="outline" size="sm">{{ t('files.notAttached') }}</UBadge>
        </template>
        <template #cell-deletedByName="{ row }">
          <span class="inline-flex min-w-0 items-center gap-2">
            <PlatformUserAvatar :name="row.deletedByName ?? '?'" :seed="row.deletedBy ?? row.id" size="xs" />
            <span class="truncate">{{ row.deletedByName ?? t('files.unknownUser') }}</span>
          </span>
        </template>
        <template #cell-deletedAt="{ row }">
          <UTooltip :text="dateTime(row.deletedAt)">
            <time :datetime="row.deletedAt" class="whitespace-nowrap">{{ relative(row.deletedAt) }}</time>
          </UTooltip>
        </template>
        <template #cell-purgeAt="{ row }">
          <UTooltip :text="dateTime(row.purgeAt)">
            <time :datetime="row.purgeAt" class="whitespace-nowrap">{{ dateTime(row.purgeAt, 'll') }}</time>
          </UTooltip>
        </template>
        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end" @click.stop>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-undo-2"
              :aria-label="t('files.trash.restore', { name: row.filename })"
              @click="restore(row)"
            />
            <UButton
              v-if="admin"
              size="sm"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              :aria-label="t('files.trash.destroyOne', { name: row.filename })"
              @click="destroy(row)"
            />
          </div>
        </template>
      </PlatformDataTable>
    </UCard>
  </div>
</template>

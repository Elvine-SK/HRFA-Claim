<script setup lang="ts">
import type { StatItem } from '../../components/platform/StatStrip.vue'
import { FILES_KEY } from '../../composables/useUpload'
import type { FileUsage } from '../../types/platform'

definePageMeta({ title: 'files.nav.admin', permission: 'file.read_all' })

const { t } = useI18n()
const manifest = useManifest()
const access = useAccess()
const router = useRouter()
const route = useRoute()
useHead({ title: () => t('files.admin.title') })

// The trash is its own list: switching drops the other list's search, filters and page from the URL.
const canManage = computed(() => access.can('file.manage'))
const view = computed<'files' | 'trash'>({
  get: () => (route.query.view === 'trash' && canManage.value ? 'trash' : 'files'),
  set: (v) => void router.replace({ query: v === 'trash' ? { view: 'trash' } : {} }),
})

const usage = useApiItem<FileUsage>(FILES_KEY, '/files/usage')
const stats = computed<StatItem[]>(() => {
  const u = usage.data.value
  // The split by type and by record is in the storage panel below.
  const loose = u?.byEntity.find((e) => e.entityType === null)
  return [
    { label: t('files.stats.files'), value: u?.files, icon: 'i-lucide-files', tone: 'accent' },
    {
      label: t('files.stats.storage'),
      value: u ? formatBytes(u.bytes) : undefined,
      icon: 'i-lucide-hard-drive',
      tone: 'info',
    },
    {
      label: t('files.notAttached'),
      value: u ? (loose?.files ?? 0) : undefined,
      hint: u ? formatBytes(loose?.bytes ?? 0) : undefined,
      icon: 'i-lucide-unlink',
      tone: 'warning',
    },
    {
      label: t('files.stats.trash'),
      value: u?.trash.files,
      hint: u ? formatBytes(u.trash.bytes) : undefined,
      icon: 'i-lucide-trash-2',
      tone: 'neutral',
    },
  ]
})

// From the storage panel: a largest-file row searches the list for that file, Open trash shows the trash;
// both bring the list into view.
const listTop = useTemplateRef<HTMLElement>('listTop')
async function toList(query: Record<string, string>) {
  await router.replace({ query })
  await nextTick()
  listTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <PlatformErrorPage v-if="manifest.data.value && !manifest.has('files')" :status="404" />
  <div v-else>
    <PlatformPageHeader
      :eyebrow="t('admin.nav.group')"
      :title="t('files.admin.title')"
      :subtitle="t('files.admin.subtitle')"
    />
    <PlatformStatStrip :items="stats" :loading="usage.isPending.value" />
    <PlatformFilesStoragePanel
      :usage="usage.data.value"
      :loading="usage.isPending.value"
      :can-manage="canManage"
      @find="(filename: string) => toList({ q: filename })"
      @trash="toList({ view: 'trash' })"
    />
    <div ref="listTop" class="list-top" />
    <PlatformSegmented
      v-if="canManage"
      v-model="view"
      class="mb-3"
      :options="[
        { value: 'files', label: t('files.admin.title'), icon: 'i-lucide-folder-open' },
        { value: 'trash', label: t('files.trash.title'), icon: 'i-lucide-trash-2' },
      ]"
      :label="t('files.trash.viewLabel')"
    />
    <PlatformFilesTrashTable v-if="view === 'trash'" source="/files/trash" admin />
    <PlatformFilesFileTable v-else source="/files/all" admin />
  </div>
</template>

<style scoped>
/* Clears the sticky top bar when the list is scrolled to. */
.list-top {
  scroll-margin-top: 84px;
}
</style>

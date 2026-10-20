<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import type { FileUsage } from '../../../types/platform'
import type { Tone } from '../../../utils/tone'

/**
 * What uses the file storage (`GET /files/usage`): the split by type and by record type as segmented bars,
 * the largest files, the people who uploaded the most, and what the trash still holds. Collapsed (remembered
 * in this browser) it is one line: a slim bar by type, the total and the trash count.
 */
const props = defineProps<{ usage?: FileUsage; loading?: boolean; canManage?: boolean }>()
const emit = defineEmits<{ find: [filename: string]; trash: [] }>()
const { t, te } = useI18n()
const manifest = useManifest()

const share = (bucket: { files: number; bytes: number }) =>
  t('files.storage.share', { size: formatBytes(bucket.bytes), n: bucket.files }, bucket.files)

const byType = computed(() => {
  const u = props.usage
  if (!u) return []
  return (
    [
      ['image', 'i-lucide-image', 'chart-3'],
      ['document', 'i-lucide-file-text', 'chart-4'],
      ['other', 'i-lucide-file', 'neutral'],
    ] as const
  ).map(([kind, icon, tone]) => ({
    label: t(`files.stats.${kind}`),
    icon,
    value: u.byType[kind].bytes,
    color: toneVar(tone),
    detail: share(u.byType[kind]),
  }))
})

const RECORD_TONES: Tone[] = ['accent', 'chart-2', 'chart-5', 'chart-6', 'chart-3', 'chart-4']
const byRecord = computed(() => {
  const entities = manifest.data.value?.fileEntities ?? []
  let next = 0
  return (props.usage?.byEntity ?? []).map((row) => {
    const entity = entities.find((e) => e.type === row.entityType)
    const label = entity ? (te(entity.label) ? t(entity.label) : entity.label) : row.entityType
    return {
      label: row.entityType ? (label ?? row.entityType) : t('files.notAttached'),
      value: row.bytes,
      color: toneVar(row.entityType ? RECORD_TONES[next++ % RECORD_TONES.length]! : 'neutral'),
      detail: share(row),
    }
  })
})

const collapsed = useLocalStorage('nelvine:files-storage-collapsed', false)
// No labels: the bar alone, without its legend.
const miniType = computed(() => byType.value.map(({ value, color }) => ({ value, color })))

// A bar's full length is the largest row, so the rows compare with each other.
const largestMax = computed(() => Math.max(1, ...(props.usage?.largest ?? []).map((f) => f.size)))
const uploaderMax = computed(() => Math.max(1, ...(props.usage?.uploaders ?? []).map((u) => u.bytes)))
const percent = (value: number, max: number) => `${Math.max(2, Math.round((value / max) * 100))}%`
</script>

<template>
  <section class="card storage-panel" data-testid="storage-panel">
    <header class="card-h storage-head" :class="{ 'is-collapsed': collapsed }">
      <h2>
        <button
          type="button"
          class="flex items-center gap-2"
          :aria-expanded="!collapsed"
          aria-controls="files-storage-body"
          data-testid="storage-toggle"
          @click="collapsed = !collapsed"
        >
          <UIcon name="i-lucide-hard-drive" class="size-4 text-[var(--app-muted)]" />
          {{ t('files.storage.title') }}
        </button>
      </h2>
      <Transition name="storage-mini">
        <UProgressGroup
          v-if="collapsed && usage?.files"
          :items="miniType"
          :max="usage.bytes"
          size="sm"
          class="storage-mini"
          data-testid="storage-mini"
          aria-hidden="true"
        />
      </Transition>
      <span v-if="usage" class="mono muted ms-auto text-xs" data-testid="storage-total">
        {{ share(usage) }}
        <template v-if="collapsed && usage.trash.files">
          · {{ t('files.storage.inTrash', { n: usage.trash.files }) }}
        </template>
      </span>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-chevron-down"
        :ui="{ leadingIcon: ['transition-transform duration-300', collapsed ? '' : 'rotate-180'] }"
        :aria-label="collapsed ? t('files.storage.expand') : t('files.storage.collapse')"
        :aria-expanded="!collapsed"
        aria-controls="files-storage-body"
        @click="collapsed = !collapsed"
      />
    </header>

    <!-- The height animates as an accordion item does; the content also fades and settles into place. -->
    <UCollapsible :open="!collapsed" :unmount-on-hide="false">
      <template #content>
        <div id="files-storage-body" class="storage-body">
          <div v-if="loading && !usage" class="card-b grid gap-3" aria-busy="true">
            <USkeleton v-for="n in 3" :key="n" class="h-8 w-full" />
          </div>
          <p v-else-if="!usage || !usage.files" class="card-b text-sm text-muted">
            {{ t('files.storage.empty') }}
          </p>
          <div v-else class="card-b storage-grid">
            <div class="grid content-start gap-5">
              <div>
                <h3 class="eyebrow mb-2">{{ t('files.storage.byType') }}</h3>
                <UProgressGroup :items="byType" :max="usage.bytes" size="lg" data-testid="storage-by-type">
                  <template #item-trailing="{ item }">{{ item.detail }}</template>
                </UProgressGroup>
              </div>
              <div>
                <h3 class="eyebrow mb-2">{{ t('files.storage.byRecord') }}</h3>
                <UProgressGroup
                  :items="byRecord"
                  :max="usage.bytes"
                  size="lg"
                  data-testid="storage-by-record"
                >
                  <template #item-trailing="{ item }">{{ item.detail }}</template>
                </UProgressGroup>
              </div>
            </div>

            <div class="grid content-start gap-5">
              <div>
                <h3 class="eyebrow mb-2">{{ t('files.storage.largest') }}</h3>
                <ul class="grid gap-1.5" data-testid="storage-largest">
                  <li v-for="f in usage.largest" :key="f.id">
                    <button
                      type="button"
                      class="storage-row"
                      :title="t('files.storage.find', { name: f.filename })"
                      @click="emit('find', f.filename)"
                    >
                      <span
                        class="file-kind !size-6 !rounded-md !text-[8px]"
                        :style="{ '--k': toneVar(fileKind(f.contentType).tone as Tone) }"
                        aria-hidden="true"
                        >{{ fileKind(f.contentType).label }}</span
                      >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-start text-[13px] font-medium">{{
                          f.filename
                        }}</span>
                        <span class="storage-bar"><i :style="{ width: percent(f.size, largestMax) }" /></span>
                      </span>
                      <span class="mono muted text-xs">{{ formatBytes(f.size) }}</span>
                    </button>
                  </li>
                </ul>
              </div>
              <div>
                <h3 class="eyebrow mb-2">{{ t('files.storage.uploaders') }}</h3>
                <ul class="grid gap-1.5" data-testid="storage-uploaders">
                  <li v-for="u in usage.uploaders" :key="u.userId" class="storage-row">
                    <PlatformUserAvatar :name="u.name ?? '?'" :seed="u.userId" size="xs" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[13px] font-medium">{{
                        u.name ?? t('files.unknownUser')
                      }}</span>
                      <span class="storage-bar"><i :style="{ width: percent(u.bytes, uploaderMax) }" /></span>
                    </span>
                    <span class="mono muted text-xs">{{ share(u) }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <footer v-if="usage?.trash.files" class="storage-trash" data-testid="storage-trash">
            <UIcon name="i-lucide-trash-2" class="size-4 shrink-0" />
            <span>{{
              t(
                'files.storage.trash',
                { n: usage.trash.files, size: formatBytes(usage.trash.bytes) },
                usage.trash.files,
              )
            }}</span>
            <UButton
              v-if="canManage"
              class="ms-auto"
              size="xs"
              color="neutral"
              variant="outline"
              :label="t('files.storage.openTrash')"
              @click="emit('trash')"
            />
          </footer>
        </div>
      </template>
    </UCollapsible>
  </section>
</template>

<style scoped>
.storage-panel {
  margin-bottom: 16px;
}
.storage-head {
  transition: padding-bottom 0.2s ease-out;
}
.storage-head.is-collapsed {
  padding-bottom: 14px;
}
.storage-mini {
  width: min(220px, 30%);
  transform-origin: left center;
}
.storage-mini-enter-active {
  transition:
    opacity 0.25s ease-out 0.1s,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1) 0.1s;
}
.storage-mini-leave-active {
  transition: opacity 0.12s ease-in;
}
.storage-mini-enter-from {
  opacity: 0;
  transform: scaleX(0.4);
}
.storage-mini-leave-to {
  opacity: 0;
}
:deep([data-state='open']) > .storage-body {
  animation: storage-body-in 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
:deep([data-state='closed']) > .storage-body {
  animation: storage-body-out 0.18s ease-in forwards;
}
@keyframes storage-body-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
}
@keyframes storage-body-out {
  to {
    opacity: 0;
    transform: translateY(-6px);
  }
}
.storage-grid {
  display: grid;
  gap: 24px 32px;
}
/* Grid tracks default to the width of their content: every level is told it may shrink, or a long file name
   or bar pushes the panel wider than a phone. */
.storage-grid,
.storage-grid > div,
.storage-grid ul {
  grid-template-columns: minmax(0, 1fr);
}
.storage-grid > div > div {
  min-width: 0;
}
@media (min-width: 900px) {
  .storage-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
.storage-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 4px 6px;
  border-radius: var(--app-r-sm);
}
button.storage-row {
  cursor: pointer;
  transition: background-color 0.15s;
}
button.storage-row:hover,
button.storage-row:focus-visible {
  background: color-mix(in oklab, var(--app-accent) 7%, transparent);
  outline: none;
}
.storage-bar {
  display: block;
  height: 4px;
  margin-top: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in oklab, var(--app-muted) 16%, transparent);
}
.storage-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--app-accent);
  transition: width 0.4s ease-out;
}
.storage-trash {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-top: 1px solid var(--app-border);
  color: var(--app-muted);
  font-size: 13px;
}
/* The sentence wraps inside its own box, next to the icon. */
.storage-trash > span {
  min-width: 0;
  flex: 1 1 12rem;
}
</style>

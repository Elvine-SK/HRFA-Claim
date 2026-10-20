<script setup lang="ts">
import type { TimelineEvent } from '../ActivityTimeline.vue'
import type { Tone } from '../../../utils/tone'

export interface HistoryEntry {
  id: string
  version: number
  action: 'create' | 'update' | 'delete' | 'restore'
  /** `[before, after]` per changed field. */
  changes: Record<string, [unknown, unknown]>
  changedBy: string | null
  changedAt: string
}

const props = withDefaults(
  defineProps<{
    entries: HistoryEntry[] | undefined
    loading?: boolean
    error?: Error | null
    fieldLabel?: (field: string) => string
    format?: (field: string, value: unknown) => string | undefined
    actorName?: (id: string) => string | undefined
    hidden?: readonly string[]
  }>(),
  {
    loading: false,
    error: null,
    fieldLabel: undefined,
    format: undefined,
    actorName: undefined,
    hidden: () => ['version', 'updatedAt'],
  },
)
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const { dateTime } = useDates()

const STYLE: Record<HistoryEntry['action'], { icon: string; tone: Tone }> = {
  create: { icon: 'i-lucide-plus', tone: 'success' },
  update: { icon: 'i-lucide-pencil', tone: 'accent' },
  delete: { icon: 'i-lucide-trash-2', tone: 'danger' },
  restore: { icon: 'i-lucide-rotate-ccw', tone: 'info' },
}

const events = computed(() =>
  [...(props.entries ?? [])]
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.version - a.version)
    .map((entry) => ({
      id: entry.id,
      at: entry.changedAt,
      ...STYLE[entry.action],
      entry,
      changes: Object.entries(entry.changes).filter(([field]) => !props.hidden.includes(field)),
    })),
)
type Row = (typeof events.value)[number]
const rowOf = (event: TimelineEvent) => event as Row

const label = (field: string) => props.fieldLabel?.(field) ?? field
function show(field: string, value: unknown) {
  const custom = props.format?.(field, value)
  if (custom !== undefined) return custom
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? t('records.history.yes') : t('records.history.no')
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}
const who = (id: string | null) =>
  id ? (props.actorName?.(id) ?? t('records.history.someone')) : t('records.history.system')
</script>

<template>
  <div v-if="loading" class="flex flex-col gap-4">
    <USkeleton v-for="n in 3" :key="n" class="h-10 w-full" />
  </div>
  <UAlert
    v-else-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="error.message"
    :actions="[
      {
        label: t('platform.actions.retry'),
        color: 'neutral',
        variant: 'outline',
        onClick: () => emit('retry'),
      },
    ]"
  />
  <p v-else-if="!events.length" class="muted text-sm">{{ t('records.history.empty') }}</p>
  <PlatformActivityTimeline v-else :events="events">
    <template #default="{ event }">
      <p>
        <b>
          {{
            rowOf(event).entry.action === 'update'
              ? t('records.history.update', {
                  fields:
                    rowOf(event)
                      .changes.map(([f]) => label(f))
                      .join(', ') || '—',
                })
              : t(`records.history.${rowOf(event).entry.action}`)
          }}
        </b>
        <span class="muted">
          · {{ t('records.history.by', { who: who(rowOf(event).entry.changedBy) }) }} ·
          <span class="font-mono">v{{ rowOf(event).entry.version }}</span>
        </span>
      </p>
      <ul v-if="rowOf(event).entry.action === 'update' && rowOf(event).changes.length" class="diff">
        <li v-for="[field, pair] in rowOf(event).changes" :key="field">
          <span class="muted">{{ label(field) }}:</span>
          <del>{{ show(field, pair[0]) }}</del>
          <UIcon name="i-lucide-arrow-right" class="size-3 text-[var(--app-muted)]" />
          <span class="sr-only">{{ t('records.history.to') }}</span>
          <ins>{{ show(field, pair[1]) }}</ins>
        </li>
      </ul>
      <p class="sr-only">{{ dateTime(event.at) }}</p>
    </template>
  </PlatformActivityTimeline>
</template>

<style scoped>
.diff {
  display: grid;
  gap: 3px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
}
.diff li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.diff del {
  color: var(--app-muted);
  text-decoration: line-through;
  overflow-wrap: anywhere;
}
.diff ins {
  font-weight: 500;
  text-decoration: none;
  overflow-wrap: anywhere;
}
</style>

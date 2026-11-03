<script setup lang="ts" generic="T">
import type { WidgetSize } from '@elvine-sk/platform-nuxt/utils'
import type { Tone } from '../../utils/tone'

/** One row of a dashboard list: a title, a line under it, an optional tag, and where it leads. */
export interface WidgetRow {
  key: string
  title: string
  sub: string
  tag?: { label: string; tone: Tone }
  to: string
}

const props = defineProps<{
  size: WidgetSize
  queryKey: string
  /** The API list, e.g. `/settlements/to-file`. */
  path: string
  title: string
  subtitle: string
  icon: string
  empty: string
  viewAll: { to: string; label: string }
  row: (item: T) => WidgetRow
}>()

const params = computed(() => new URLSearchParams({ pageSize: props.size === 's' ? '3' : '5' }))
const list = useApiList<T>(props.queryKey, props.path, { params })
const rows = computed(() => (list.data.value?.data ?? []).map(props.row))
</script>

<template>
  <PlatformDashboardWidgetFrame
    :title="title"
    :subtitle="subtitle"
    :icon="icon"
    :loading="list.isPending.value"
    :error="list.error.value"
    @retry="list.refetch()"
  >
    <template #action>
      <NuxtLink :to="viewAll.to" class="shrink-0 text-[12.5px] font-medium text-[var(--app-accent)]">
        {{ viewAll.label }} ({{ list.data.value?.meta.total ?? 0 }})
      </NuxtLink>
    </template>
    <p v-if="!rows.length" class="py-4 text-center text-xs text-muted">{{ empty }}</p>
    <ul v-else>
      <li v-for="r in rows" :key="r.key" class="row">
        <div class="min-w-0 flex-1">
          <b class="block truncate text-[13px] font-semibold">{{ r.title }}</b>
          <small class="block truncate text-xs text-muted">{{ r.sub }}</small>
        </div>
        <span v-if="r.tag" class="tag mono" :style="{ '--k': toneVar(r.tag.tone) }">{{ r.tag.label }}</span>
        <NuxtLink :to="r.to" class="ib" :aria-label="r.title">
          <UIcon name="i-lucide-chevron-right" />
        </NuxtLink>
      </li>
    </ul>
  </PlatformDashboardWidgetFrame>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--app-border);
}
.row:last-child {
  border-bottom: 0;
}
.tag {
  padding: 2px 8px;
  border-radius: 6px;
  background: color-mix(in oklab, var(--k) 13%, transparent);
  color: color-mix(in oklab, var(--k) 75%, var(--app-text));
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.ib {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-sm);
  background: var(--app-surface);
  color: var(--app-muted);
  font-size: 15px;
}
.ib:hover {
  background: var(--app-hover);
  color: var(--app-text);
}
</style>

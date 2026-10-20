<script setup lang="ts">
import type { WidgetSize } from '@elvine-sk/platform-nuxt/utils'
import type { DashboardStat } from '../../../types/platform'
import type { StatItem } from '../StatStrip.vue'

defineProps<{ size: WidgetSize }>()
const { t, te } = useI18n()
const stats = useApiItem<DashboardStat[]>(DASHBOARD_KEY, '/dashboard/stats', { staleTime: 30_000 })
const items = computed<StatItem[]>(() =>
  (stats.data.value ?? []).map((stat) => ({
    label: te(stat.label) ? t(stat.label) : stat.label,
    value: stat.error ? '—' : stat.value,
    icon: stat.icon ?? undefined,
    tone: stat.tone ?? 'accent',
    hint: stat.error ? t('dashboard.stats.failed') : undefined,
  })),
)
</script>

<template>
  <PlatformDashboardWidgetFrame
    :title="t('dashboard.widgets.stats.title')"
    icon="i-lucide-chart-no-axes-column"
    :loading="stats.isPending.value"
    :error="stats.error.value"
    bare
    flush
    @retry="stats.refetch()"
  >
    <template #skeleton><USkeleton class="h-20 w-full" /></template>
    <div class="h-full" data-testid="stats-widget">
      <p v-if="!items.length" class="p-(--app-pad) text-sm text-muted">{{ t('dashboard.stats.none') }}</p>
      <PlatformStatStrip v-else :items="items" flush class="h-full" />
    </div>
  </PlatformDashboardWidgetFrame>
</template>

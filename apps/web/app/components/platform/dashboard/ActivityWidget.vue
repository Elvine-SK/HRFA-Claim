<script setup lang="ts">
import type { WidgetSize } from '@elvine-sk/platform-nuxt/utils'
import type { AuditEvent } from '../../../types/platform'
import type { Tone } from '../../../utils/tone'

defineProps<{ size: WidgetSize }>()
const { t, te } = useI18n()
const { dayjs, date, dateTime } = useDates()
const params = ref(new URLSearchParams({ pageSize: '8' }))
const events = useApiList<AuditEvent>(ADMIN_KEY, '/audit/events', { params })

const CATEGORY: Record<AuditEvent['category'], { icon: string; tone: Tone }> = {
  auth: { icon: 'i-lucide-log-in', tone: 'info' },
  authz: { icon: 'i-lucide-shield', tone: 'chart-2' },
  admin: { icon: 'i-lucide-settings', tone: 'chart-5' },
  data: { icon: 'i-lucide-database', tone: 'accent' },
  approval: { icon: 'i-lucide-stamp', tone: 'success' },
  system: { icon: 'i-lucide-cpu', tone: 'neutral' },
}
// Failures and denials stand out whatever their category.
const look = (event: AuditEvent) =>
  event.outcome === 'success'
    ? CATEGORY[event.category]
    : { icon: 'i-lucide-triangle-alert', tone: 'danger' as Tone }
const sentence = (event: AuditEvent) => `dashboard.widgets.activity.events.${event.action}`
const actor = (event: AuditEvent) =>
  event.actorName ?? t(`admin.audit.actorTypes.${event.actorType}`, event.actorType)

/** "now", "5m", "3h", "2d", then the date: the feed is read at a glance. */
function ago(value: string) {
  const minutes = dayjs().diff(dayjs(value), 'minute')
  if (minutes < 1) return t('dashboard.ago.now')
  if (minutes < 60) return t('dashboard.ago.minutes', { n: minutes })
  if (minutes < 60 * 24) return t('dashboard.ago.hours', { n: Math.floor(minutes / 60) })
  if (minutes < 60 * 24 * 7) return t('dashboard.ago.days', { n: Math.floor(minutes / (60 * 24)) })
  return date(value, 'D MMM')
}
</script>

<template>
  <PlatformDashboardWidgetFrame
    :title="t('dashboard.widgets.activity.title')"
    :subtitle="t('dashboard.widgets.activity.subtitle')"
    icon="i-lucide-activity"
    :loading="events.isPending.value"
    :error="events.error.value"
    @retry="events.refetch()"
  >
    <template #action>
      <NuxtLink to="/admin/audit" class="shrink-0 text-[12.5px] font-medium text-[var(--app-accent)]">
        {{ t('dashboard.widgets.activity.viewAll') }}
      </NuxtLink>
    </template>
    <p v-if="!events.data.value?.data.length" class="text-sm text-muted">
      {{ t('dashboard.widgets.activity.empty') }}
    </p>
    <ul v-else data-testid="activity-widget">
      <li
        v-for="event in events.data.value.data"
        :key="event.id"
        class="ev"
        :style="{ '--k': toneVar(look(event).tone) }"
      >
        <span class="ic"><UIcon :name="look(event).icon" /></span>
        <p class="min-w-0">
          <i18n-t v-if="te(sentence(event))" :keypath="sentence(event)" scope="global">
            <template #actor
              ><b>{{ actor(event) }}</b></template
            >
          </i18n-t>
          <template v-else>
            <b>{{ actor(event) }}</b>
            <span class="mono ms-1.5 text-xs text-muted">{{ event.action }}</span>
          </template>
        </p>
        <time class="mono" :datetime="event.occurredAt" :title="dateTime(event.occurredAt)">
          {{ ago(event.occurredAt) }}
        </time>
      </li>
    </ul>
  </PlatformDashboardWidgetFrame>
</template>

<style scoped>
.ev {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--app-border);
  font-size: 12.5px;
}
.ev:last-child {
  border-bottom: 0;
}
.ev p {
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.ev b {
  font-weight: 600;
}
.ic {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: var(--app-r-sm);
  background: color-mix(in oklab, var(--k) 14%, transparent);
  color: var(--k);
  font-size: 14px;
}
time {
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
</style>

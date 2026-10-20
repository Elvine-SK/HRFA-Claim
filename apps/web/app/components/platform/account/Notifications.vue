<script setup lang="ts">
import type { NotificationPreference } from '../../../types/notifications'

const { t } = useI18n()
const notify = useNotify()
const { query, save } = useNotificationPreferences()

const busy = ref<string | null>(null)

async function toggle(row: NotificationPreference, channel: 'inApp' | 'email', value: boolean) {
  busy.value = `${row.type}:${channel}`
  try {
    await save.mutateAsync({ type: row.type, inApp: row.inApp, email: row.email, [channel]: value })
    notify.success(t('notifications.prefs.saved'))
  } catch (error) {
    // The cached rows are untouched on failure, so the switch snaps back.
    notify.error(error)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section class="card">
    <header class="card-h">
      <div class="flex-1">
        <h2>{{ t('notifications.prefs.title') }}</h2>
        <p>{{ t('notifications.prefs.text') }}</p>
      </div>
    </header>
    <div v-if="query.isPending.value" class="p-4"><USkeleton class="h-24 w-full" /></div>
    <PlatformEmptyState
      v-else-if="query.isError.value"
      kind="no-results"
      icon="i-lucide-circle-alert"
      tone="danger"
      :title="notify.messageOf(query.error.value)"
    />
    <table v-else class="np">
      <thead>
        <tr>
          <th scope="col">{{ t('notifications.prefs.type') }}</th>
          <th scope="col">{{ t('notifications.prefs.inApp') }}</th>
          <th scope="col">{{ t('notifications.prefs.email') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in query.data.value ?? []" :key="row.type" :data-testid="`pref-${row.type}`">
          <th scope="row">{{ row.label }}</th>
          <td v-for="channel in ['inApp', 'email'] as const" :key="channel">
            <USwitch
              :model-value="row[channel]"
              :loading="busy === `${row.type}:${channel}`"
              :disabled="!!busy"
              :aria-label="`${row.label}: ${t(`notifications.prefs.${channel}`)}`"
              @update:model-value="(value: boolean) => toggle(row, channel, value)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.np {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.np th,
.np td {
  padding: 10px var(--app-pad, 16px);
  border-top: 1px solid var(--app-border);
  text-align: left;
}
.np thead th {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 600;
}
.np td,
.np thead th:not(:first-child) {
  width: 96px;
  text-align: center;
}
.np tbody th {
  font-weight: 500;
}
</style>

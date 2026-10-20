<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'
import { useQuery } from '@tanstack/vue-query'

interface SessionRow {
  id: string
  current: boolean
  persistent: boolean
  createdAt: string
  lastSeenAt: string | null
  expiresAt: string
  ip: string | null
  userAgent: string | null
}

const { t } = useI18n()
const api = useApi()
const notify = useNotify()
const confirm = useConfirm()
const dates = useDates()

const sessions = useQuery({
  queryKey: ['auth', 'sessions'],
  queryFn: async () => (await api<DataResponse<SessionRow[]>>('/auth/sessions')).data,
})
const others = computed(() => (sessions.data.value ?? []).filter((s) => !s.current))
const busyId = ref<string | null>(null)

function describe(ua: string | null) {
  if (!ua) return { device: t('account.sessions.unknownDevice'), icon: 'i-lucide-monitor' }
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  const mobile = /Mobile|Android|iPhone/.test(ua)
  const device = [browser, os].filter(Boolean).join(' · ') || ua.slice(0, 60)
  return { device, icon: mobile ? 'i-lucide-smartphone' : 'i-lucide-monitor' }
}

async function revoke(row: SessionRow) {
  busyId.value = row.id
  try {
    await api(`/auth/sessions/${row.id}`, { method: 'DELETE' })
    await sessions.refetch()
    notify.success(t('account.sessions.revoked'))
  } catch (error) {
    notify.error(error)
  } finally {
    busyId.value = null
  }
}

async function revokeOthers() {
  const ok = await confirm({
    title: t('account.sessions.revokeOthersTitle', { n: others.value.length }, others.value.length),
    description: t('account.sessions.revokeOthersText'),
    confirmLabel: t('account.sessions.revokeOthers'),
    danger: true,
  })
  if (!ok) return
  try {
    await api('/auth/sessions/revoke-others', { method: 'POST' })
    await sessions.refetch()
    notify.success(t('account.sessions.revokedOthers'))
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <section class="card">
    <header class="card-h">
      <div class="flex-1">
        <h2>{{ t('account.sessions.title') }}</h2>
        <p>{{ t('account.sessions.text') }}</p>
      </div>
      <UButton
        v-if="others.length"
        size="sm"
        color="error"
        variant="outline"
        icon="i-lucide-log-out"
        @click="revokeOthers"
      >
        {{ t('account.sessions.revokeOthers') }}
      </UButton>
    </header>
    <ul class="card-list">
      <li v-if="sessions.isPending.value"><USkeleton class="h-10 w-full" /></li>
      <li v-for="row in sessions.data.value ?? []" :key="row.id">
        <span class="s-ico"><UIcon :name="describe(row.userAgent).icon" /></span>
        <div class="min-w-0 flex-1">
          <b class="flex flex-wrap items-center gap-2 text-[13.5px]">
            {{ describe(row.userAgent).device }}
            <UBadge v-if="row.current" color="success" variant="subtle" size="sm">
              {{ t('account.sessions.current') }}
            </UBadge>
            <UBadge v-if="row.persistent" color="neutral" variant="subtle" size="sm">
              {{ t('account.sessions.remembered') }}
            </UBadge>
          </b>
          <span class="text-[12.5px] text-[var(--app-muted)]">
            <span v-if="row.ip" class="mono">{{ row.ip }}</span>
            <template v-if="row.ip"> · </template>
            {{ t('account.sessions.signedIn', { when: dates.dateTime(row.createdAt) }) }} ·
            {{ t('account.sessions.lastSeen', { when: dates.relative(row.lastSeenAt ?? row.createdAt) }) }}
          </span>
        </div>
        <UButton
          v-if="!row.current"
          size="sm"
          color="neutral"
          variant="outline"
          :loading="busyId === row.id"
          @click="revoke(row)"
        >
          {{ t('account.sessions.revoke') }}
        </UButton>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.s-ico {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: var(--app-r-sm);
  background: var(--app-surface-2);
  color: var(--app-muted);
}
</style>

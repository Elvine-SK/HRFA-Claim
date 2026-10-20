<script setup lang="ts">
import type { DashboardWidget, missingAccess } from '@elvine-sk/platform-nuxt/utils'

const props = defineProps<{
  visible: DashboardWidget[]
  locked: DashboardWidget[]
  placed: string[]
  /** Why a locked widget is locked. */
  missing: (widget: DashboardWidget) => ReturnType<typeof missingAccess>
}>()
const emit = defineEmits<{ add: [id: string] }>()
const open = defineModel<boolean>('open', { default: false })
const { t, te } = useI18n()

// "Audit log · Read" where the locale files name the resource and the action; the key itself otherwise.
function permissionName(key: string) {
  const at = key.lastIndexOf('.')
  const resource = `admin.roles.resources.${key.slice(0, at)}`
  const action = `admin.roles.actions.${key.slice(at + 1)}`
  return te(resource) && te(action) ? `${t(resource)} · ${t(action)}` : key
}

// The role grant is the admin's to give; a data permission is named so they know what to ask for.
function lockText(widget: DashboardWidget) {
  const missing = props.missing(widget)
  if (missing && 'permission' in missing)
    return t('dashboard.catalog.needs', { permission: permissionName(missing.permission) })
  return t('dashboard.catalog.needsRole')
}

type Row = DashboardWidget & { state: 'available' | 'placed' | 'locked' }
const rows = computed<Row[]>(() =>
  [
    ...props.visible.map((w): Row => ({ ...w, state: props.placed.includes(w.id) ? 'placed' : 'available' })),
    ...props.locked.map((w): Row => ({ ...w, state: 'locked' })),
  ].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
)
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t('dashboard.catalog.title')"
    :description="t('dashboard.catalog.text')"
  >
    <template #body>
      <ul class="flex flex-col gap-2" data-testid="widget-catalog">
        <li
          v-for="row in rows"
          :key="row.id"
          class="flex items-start gap-3 rounded-[var(--app-r-md)] border border-[var(--app-border)] p-3"
          :data-widget="row.id"
          :data-state="row.state"
        >
          <UIcon :name="row.icon" class="mt-0.5 size-5 shrink-0 text-[var(--app-accent)]" />
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ t(row.title) }}</p>
            <p class="text-xs text-muted">{{ t(row.description) }}</p>
            <p v-if="row.state === 'locked'" class="mt-1 flex items-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-lock" class="size-3" />
              {{ lockText(row) }}
            </p>
          </div>
          <UButton
            v-if="row.state === 'available'"
            size="sm"
            icon="i-lucide-plus"
            @click="emit('add', row.id)"
          >
            {{ t('dashboard.catalog.add') }}
          </UButton>
          <UBadge v-else-if="row.state === 'placed'" color="neutral" variant="subtle">
            {{ t('dashboard.catalog.placed') }}
          </UBadge>
        </li>
      </ul>
    </template>
  </USlideover>
</template>

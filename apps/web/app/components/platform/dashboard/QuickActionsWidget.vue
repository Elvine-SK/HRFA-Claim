<script setup lang="ts">
import type { WidgetSize } from '@elvine-sk/platform-nuxt/utils'

defineProps<{ size: WidgetSize }>()
const { t } = useI18n()
const quick = useQuickActions()
const access = useAccess()
const nav = useNavigation()

// The app's shortcuts first, then the menu pages this person may open.
const tiles = computed(() =>
  [
    ...quick.list().filter((action) => !action.permission || access.canSome(action.permission)),
    ...nav.items.value
      // A child page can share its parent's route (Notes and All notes): one tile per route.
      .filter((item, i, all) => item.to && item.to !== '/' && all.findIndex((o) => o.to === item.to) === i)
      .map((item) => ({
        id: `nav-${item.id}`,
        label: item.label,
        icon: item.icon ?? 'i-lucide-arrow-right',
        to: item.to!,
      })),
  ].slice(0, 6),
)
</script>

<template>
  <PlatformDashboardWidgetFrame
    :title="t('dashboard.widgets.quick.title')"
    :subtitle="t('dashboard.widgets.quick.subtitle')"
    icon="i-lucide-zap"
  >
    <p v-if="!tiles.length" class="text-sm text-muted">
      {{ t('dashboard.widgets.quick.empty') }}
    </p>
    <ul v-else class="qa" data-testid="quick-widget">
      <li v-for="tile in tiles" :key="tile.id">
        <NuxtLink :to="tile.to">
          <UIcon :name="tile.icon" class="ico" />
          <span class="max-w-full truncate">{{ t(tile.label) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </PlatformDashboardWidgetFrame>
</template>

<style scoped>
.qa {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.qa a {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: var(--app-surface);
  font-size: 13px;
  font-weight: 600;
  transition:
    border-color var(--app-dur-base),
    background-color var(--app-dur-base);
}
.qa a:hover,
.qa a:focus-visible {
  border-color: color-mix(in oklab, var(--app-accent) 40%, var(--app-border));
  background: var(--app-hover);
}
.ico {
  width: 18px;
  height: 18px;
  color: var(--app-accent);
}
</style>

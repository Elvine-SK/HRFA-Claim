<script setup lang="ts">
definePageMeta({ title: 'shell.home' })

const { t } = useI18n()
const session = useSession()
const nav = useNavigation()
const manifest = useManifest()

// With platform-dashboard installed the home page is the dashboard; otherwise every section this user may open.
const hasDashboard = computed(() => manifest.has('dashboard'))
const links = computed(() => nav.items.value.filter((item) => item.to && item.to !== '/'))
</script>

<template>
  <PlatformDashboardBoard v-if="hasDashboard" />
  <div v-else>
    <PlatformPageHeader
      :eyebrow="t('shell.workspace')"
      :title="t('home.title', { name: session.user.value?.displayName ?? '' })"
      :subtitle="t('home.subtitle')"
    />
    <PlatformEmptyState v-if="!links.length" :title="t('home.emptyTitle')" :text="t('home.emptyText')" />
    <ul v-else class="home-links">
      <li v-for="item in links" :key="item.id">
        <NuxtLink :to="item.to" class="home-link">
          <UIcon v-if="item.icon" :name="item.icon" class="size-5 text-[var(--app-accent)]" />
          <span>{{ t(item.label) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.home-links {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--app-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}
.home-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: var(--app-surface);
  font-weight: 500;
}
.home-link:hover,
.home-link:focus-visible {
  border-color: var(--app-accent);
}
</style>

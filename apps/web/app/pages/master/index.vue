<script setup lang="ts">
definePageMeta({ title: 'master.nav.title' })

const { t } = useI18n()
const pages = [
  { id: 'rankMap', to: '/master/rank-map', icon: 'i-lucide-git-compare-arrows' },
  { id: 'countries', to: '/master/countries', icon: 'i-lucide-globe' },
  { id: 'borderRoutes', to: '/master/border-routes', icon: 'i-lucide-signpost' },
  { id: 'rates', to: '/master/rates', icon: 'i-lucide-banknote' },
  { id: 'flatRates', to: '/master/flat-rates', icon: 'i-lucide-fuel' },
  { id: 'advanceBands', to: '/master/advance-bands', icon: 'i-lucide-wallet' },
  { id: 'glAccounts', to: '/master/gl-accounts', icon: 'i-lucide-book-open' },
  { id: 'postingEntries', to: '/master/posting-entries', icon: 'i-lucide-arrow-left-right' },
]
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('master.nav.title')" :subtitle="t('master.index.subtitle')" />
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="page in pages"
        :key="page.id"
        :to="page.to"
        class="block rounded-lg border border-default p-4 hover:bg-elevated"
      >
        <span class="flex items-center gap-2 font-medium">
          <UIcon :name="page.icon" class="size-4 shrink-0" />
          {{ t(`master.${page.id}.title`) }}
        </span>
        <span class="mt-1 block text-[13px] text-muted">{{ t(`master.${page.id}.line`) }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

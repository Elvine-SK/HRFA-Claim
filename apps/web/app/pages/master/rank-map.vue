<script setup lang="ts">
definePageMeta({ title: 'master.rankMap.title' })

const { t } = useI18n()
const access = useAccess()
const notify = useNotify()
const canManage = computed(() => access.canSome('travel_master.manage'))

const postTypes = useTravelPostTypes()
const ranks = useTravelRanks()
const { mapRank, unmapRank } = useTravelMasterMutations()
const localName = useLocalName()

const rankItems = computed(() =>
  (ranks.data.value ?? []).map((r) => ({ label: `${r.code} · ${localName(r)}`, value: r.code })),
)
// Unmapped rows first, then by PostType.
const rows = computed(() =>
  [...(postTypes.data.value ?? [])].sort(
    (a, b) => Number(a.mapped !== null) - Number(b.mapped !== null) || a.postType - b.postType,
  ),
)
const unmappedCount = computed(() => rows.value.filter((r) => r.mapped === null).length)

const names = (row: { postNames: string[] }) => {
  const shown = row.postNames.slice(0, 3).join(', ')
  return row.postNames.length > 3 ? `${shown} +${row.postNames.length - 3}` : shown || '—'
}

async function pick(postType: number, rankCode: string | undefined) {
  try {
    if (rankCode) await mapRank.mutateAsync({ postType, rankCode })
    else await unmapRank.mutateAsync(postType)
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('master.rankMap.title')" :subtitle="t('master.rankMap.hint')" />
    <UAlert
      v-if="unmappedCount"
      class="mb-4"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('master.rankMap.unmapped', { n: unmappedCount }, unmappedCount)"
    />
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <USkeleton v-if="postTypes.isPending.value" class="h-48" />
      <UAlert
        v-else-if="postTypes.error.value"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="notify.messageOf(postTypes.error.value)"
      />
      <MasterTable v-else :caption="t('master.rankMap.title')">
        <thead>
          <tr>
            <th>{{ t('master.rankMap.postType') }}</th>
            <th>{{ t('master.rankMap.positions') }}</th>
            <th>{{ t('master.rankMap.rank') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.postType">
            <td class="mono">
              {{ row.postType }}
              <UBadge v-if="row.mapped === null" color="warning" variant="subtle" size="sm" class="ms-2">{{
                t('master.rankMap.notMapped')
              }}</UBadge>
            </td>
            <td>{{ names(row) }}</td>
            <td>
              <div v-if="canManage" class="flex items-center gap-2">
                <USelect
                  :model-value="row.mapped ?? undefined"
                  :items="rankItems"
                  :placeholder="t('master.rankMap.pick')"
                  :aria-label="t('master.rankMap.rank')"
                  class="w-56"
                  @update:model-value="(v: string) => pick(row.postType, v)"
                />
                <UButton
                  v-if="row.mapped !== null"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  :aria-label="t('platform.actions.clear')"
                  @click="pick(row.postType, undefined)"
                />
              </div>
              <span v-else class="mono">{{ row.mapped ?? '—' }}</span>
            </td>
          </tr>
        </tbody>
      </MasterTable>
    </UCard>
  </div>
</template>

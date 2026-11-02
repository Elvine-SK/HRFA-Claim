<script setup lang="ts">
definePageMeta({ title: 'master.postingEntries.title' })

const { t, locale } = useI18n()
const kind = useQueryParam('kind', 'domestic')
const zoneKind = computed<ZoneKind>(() => (ZONE_KINDS.includes(kind.value as ZoneKind) ? (kind.value as ZoneKind) : 'domestic'))
const tabs = computed(() => ZONE_KINDS.map((k) => ({ label: t(`master.postingEntries.kind.${k}`), value: k })))
const caseParam = useQueryParam('case', 'payment')
const caseKey = computed<PostingCase>(() =>
  POSTING_CASES.includes(caseParam.value as PostingCase) ? (caseParam.value as PostingCase) : 'payment',
)
const cases = computed(() => POSTING_CASES.map((c) => ({ label: t(`master.postingEntries.case.${c}`), value: c })))
const entries = usePostingEntries(caseKey, zoneKind)
const glName = (e: PostingEntry) => (locale.value === 'lo' ? e.glNameLo : e.glNameEn) || '—'
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('master.postingEntries.title')" :subtitle="t('master.postingEntries.line')" />
    <UTabs :model-value="caseKey" :items="cases" :content="false" class="mb-2" @update:model-value="(v) => (caseParam = String(v))" />
    <UTabs :model-value="zoneKind" :items="tabs" :content="false" class="mb-4" @update:model-value="(v) => (kind = String(v))" />
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <USkeleton v-if="entries.isPending.value" class="h-48" />
      <UAlert v-else-if="entries.error.value" color="error" variant="subtle" :title="entries.error.value.message" />
      <MasterTable v-else :caption="t('master.postingEntries.title')">
        <thead>
          <tr>
            <th>{{ t('master.postingEntries.component') }}</th>
            <th>{{ t('master.postingEntries.side') }}</th>
            <th>{{ t('master.postingEntries.account') }}</th>
            <th>{{ t('master.glAccounts.gl') }}</th>
            <th>{{ t('master.glAccounts.seq') }}</th>
            <th>{{ t('master.postingEntries.glName') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(e, i) in entries.data.value" :key="`${e.component}-${e.side}-${i}`">
            <td>{{ t(`master.postingEntries.components.${e.component}`) }}</td>
            <td class="mono">{{ e.side }}</td>
            <td>{{ t(`master.postingEntries.${e.accountKind}`) }}</td>
            <td class="mono">{{ e.gl ?? '—' }}</td>
            <td class="mono">{{ e.seq ?? '—' }}</td>
            <td>{{ glName(e) }}</td>
          </tr>
        </tbody>
      </MasterTable>
    </UCard>
  </div>
</template>

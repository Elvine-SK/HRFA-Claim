<script setup lang="ts">
definePageMeta({ title: 'master.glAccounts.title' })

const { t } = useI18n()
const accounts = useTravelGlAccounts()
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('master.glAccounts.title')" :subtitle="t('master.glAccounts.line')" />
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <USkeleton v-if="accounts.isPending.value" class="h-48" />
      <UAlert v-else-if="accounts.error.value" color="error" variant="subtle" :title="accounts.error.value.message" />
      <MasterTable v-else :caption="t('master.glAccounts.title')">
        <thead>
          <tr>
            <th>{{ t('master.glAccounts.gl') }}</th>
            <th>{{ t('master.glAccounts.seq') }}</th>
            <th>{{ t('master.nameEn') }}</th>
            <th>{{ t('master.nameLo') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in accounts.data.value" :key="`${a.gl}-${a.seq}`">
            <td class="mono">{{ a.gl }}</td>
            <td class="mono">{{ a.seq }}</td>
            <td>{{ a.nameEn }}</td>
            <td>{{ a.nameLo }}</td>
          </tr>
        </tbody>
      </MasterTable>
    </UCard>
  </div>
</template>

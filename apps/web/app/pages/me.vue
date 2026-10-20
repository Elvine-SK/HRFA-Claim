<script setup lang="ts">
definePageMeta({ title: 'hrm.me.title' })

/** `GET /hrm/me`: the signed-in user as an HRM employee. */
interface HrmEmployee {
  eid: string
  nameLao: string
  snameLao: string
  nameEng: string | null
  snameEng: string | null
  branchCode: string
  branchName: string | null
  departmentName: string | null
  sectionName: string | null
  unitName: string | null
  positionName: string | null
}

const { t } = useI18n()
const me = useApiItem<HrmEmployee>('hrm-me', '/hrm/me')

const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(' ') || null
const items = computed(() => {
  const e = me.data.value
  return [
    { label: t('hrm.me.eid'), value: e?.eid },
    { label: t('hrm.me.nameLao'), value: e && join(e.nameLao, e.snameLao) },
    { label: t('hrm.me.nameEng'), value: e && join(e.nameEng, e.snameEng) },
    { label: t('hrm.me.position'), value: e?.positionName },
    { label: t('hrm.me.department'), value: e?.departmentName },
    { label: t('hrm.me.section'), value: e?.sectionName },
    { label: t('hrm.me.unit'), value: e?.unitName },
    { label: t('hrm.me.branch'), value: e && join(e.branchName, `(${e.branchCode})`) },
  ]
})
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('hrm.me.title')" :subtitle="t('hrm.me.subtitle')" />
    <UCard class="max-w-2xl">
      <USkeleton v-if="me.isPending.value" class="h-48" />
      <UAlert
        v-else-if="me.error.value"
        color="warning"
        variant="subtle"
        icon="i-lucide-user-x"
        :title="t('hrm.me.notLinked')"
      />
      <PlatformKeyValue v-else :items="items" />
    </UCard>
  </div>
</template>

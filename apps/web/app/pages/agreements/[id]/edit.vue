<script setup lang="ts">
definePageMeta({ title: 'agreements.edit.title' })

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const id = computed(() => String(route.params.id))
const agreement = useAgreement(id)
useHead({ title: () => agreement.data.value?.ref ?? t('agreements.edit.title') })
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('agreements.edit.title')" :eyebrow="agreement.data.value?.ref" />
    <USkeleton v-if="agreement.isPending.value" class="h-96" />
    <PlatformErrorPage v-else-if="agreement.error.value" :status="agreement.error.value.status ?? 500" />
    <UAlert
      v-else-if="agreement.data.value && agreement.data.value.status !== 'draft'"
      color="warning"
      variant="subtle"
      :title="t('agreements.edit.notDraft')"
    />
    <AgreementsAgreementForm
      v-else-if="agreement.data.value"
      :key="agreement.data.value.version"
      :agreement="agreement.data.value"
      @saved="(a) => router.push(`/agreements/${a.id}`)"
    >
      <template #actions>
        <UButton color="neutral" variant="ghost" :to="`/agreements/${id}`">{{ t('platform.actions.cancel') }}</UButton>
      </template>
    </AgreementsAgreementForm>
  </div>
</template>

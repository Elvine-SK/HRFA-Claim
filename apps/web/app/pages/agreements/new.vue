<script setup lang="ts">
definePageMeta({ title: 'agreements.new.title', permission: 'agreement.create' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const formType = computed<FormType>(() => {
  const f = String(route.query.form ?? '')
  return (FORM_TYPES as string[]).includes(f) ? (f as FormType) : 'domestic'
})
useHead({ title: () => t('agreements.new.title') })
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('agreements.new.title')" :subtitle="t(`agreements.formType.${formType}`)" />
    <AgreementsAgreementForm :key="formType" :form-type="formType" @saved="(a) => router.push(`/agreements/${a.id}`)">
      <template #actions>
        <UButton color="neutral" variant="ghost" to="/agreements">{{ t('platform.actions.cancel') }}</UButton>
      </template>
    </AgreementsAgreementForm>
  </div>
</template>

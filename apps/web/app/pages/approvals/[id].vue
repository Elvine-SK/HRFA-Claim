<script setup lang="ts">
definePageMeta({ title: 'approval.detail.title' })

const { t } = useI18n()
const route = useRoute()
const id = computed(() => String(route.params.id))

useHead({ title: () => t('approval.detail.title') })
</script>

<template>
  <div class="mx-auto grid w-full max-w-4xl gap-3">
    <UButton
      to="/approvals?view=mine"
      color="neutral"
      variant="link"
      icon="i-lucide-arrow-left"
      class="-ms-2.5 justify-self-start px-2.5"
    >
      {{ t('approval.title') }}
    </UButton>
    <div class="card">
      <div class="card-b">
        <PlatformApprovalRequestView :id="id" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ show: boolean }>()
const emit = defineEmits<{ reload: []; dismiss: [] }>()
const { t } = useI18n()
</script>

<template>
  <UAlert
    v-if="show"
    color="warning"
    variant="subtle"
    icon="i-lucide-refresh-cw"
    :title="t('live.changedElsewhere')"
    :description="t('live.changedElsewhereHint')"
    :actions="[
      {
        label: t('live.reload'),
        color: 'warning',
        variant: 'solid',
        size: 'xs',
        onClick: () => emit('reload'),
      },
      {
        label: t('live.keepEditing'),
        color: 'neutral',
        variant: 'ghost',
        size: 'xs',
        onClick: () => emit('dismiss'),
      },
    ]"
    class="mb-4"
    data-testid="live-changed"
  />
</template>

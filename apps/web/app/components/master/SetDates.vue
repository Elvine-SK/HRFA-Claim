<script setup lang="ts">
/** The start dates of an effective-dated set: the one in effect today, past ones, future ones (deletable). */
const props = defineProps<{ sets: string[]; canManage: boolean }>()
const emit = defineEmits<{ remove: [date: string] }>()

const { t } = useI18n()
const { date } = useDates()
const today = todayLaos()

const sorted = computed(() => [...props.sets].sort().reverse())
const inEffect = computed(() => sorted.value.find((d) => d <= today))
</script>

<template>
  <ul class="grid gap-1">
    <li v-for="d in sorted" :key="d" class="flex items-center gap-2 py-1">
      <span class="mono">{{ date(d) }}</span>
      <UBadge v-if="d > today" color="info" variant="subtle" size="sm">{{ t('master.future') }}</UBadge>
      <UBadge v-else-if="d === inEffect" color="success" variant="subtle" size="sm">{{
        t('master.inEffect')
      }}</UBadge>
      <UButton
        v-if="canManage && d > today"
        class="ms-auto"
        size="sm"
        color="error"
        variant="ghost"
        icon="i-lucide-trash-2"
        :aria-label="t('platform.actions.delete')"
        @click="emit('remove', d)"
      />
    </li>
    <li v-if="!sorted.length" class="text-muted">{{ t('master.noSets') }}</li>
  </ul>
</template>

<script setup lang="ts">
import type { AvailableWorkflow } from '../../../types/approval'

/** Asks which workflow to submit to when several are available; the type's default is preselected. */
const props = defineProps<{ workflows: AvailableWorkflow[]; busy?: boolean; submitLabel: string }>()
const emit = defineEmits<{ confirm: [key: string] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const picked = ref<string | undefined>()
watch(open, (isOpen) => {
  if (isOpen) picked.value = keptChoice(props.workflows, undefined)
})
// The list reloads after a workflow became unavailable: drop a pick that is no longer offered.
watch(
  () => props.workflows,
  (list) => (picked.value = keptChoice(list, picked.value)),
)
const items = computed(() =>
  props.workflows.map((w) => ({ value: w.key, label: w.name, description: w.description ?? undefined })),
)
const isDefault = (key: string) => props.workflows.some((w) => w.key === key && w.isDefault)
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('approval.record.chooseTitle')"
    :description="t('approval.record.chooseText')"
  >
    <template #body>
      <URadioGroup
        v-model="picked"
        :items="items"
        variant="card"
        :aria-label="t('approval.record.chooseTitle')"
      >
        <template #label="{ item }">
          <span class="flex items-center gap-2">
            {{ item.label }}
            <UBadge v-if="isDefault(item.value)" size="sm" variant="subtle">
              {{ t('admin.workflows.default') }}
            </UBadge>
            <code class="muted ms-auto text-[11.5px]">{{ item.value }}</code>
          </span>
        </template>
      </URadioGroup>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          {{ t('platform.actions.cancel') }}
        </UButton>
        <UButton
          icon="i-lucide-send"
          :disabled="!picked"
          :loading="busy"
          @click="picked && emit('confirm', picked)"
        >
          {{ submitLabel }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

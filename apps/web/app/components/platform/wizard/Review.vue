<script setup lang="ts">
import type { WizardStep } from '@elvine-sk/platform-nuxt/utils'

defineProps<{
  steps: WizardStep[]
  review: Record<string, { label: string; value: string }[]>
  disabled?: boolean
}>()
const emit = defineEmits<{ edit: [index: number] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-3">
    <section v-for="(step, i) in steps" :key="step.key" class="wz-rv" :aria-label="step.label">
      <header class="flex items-center justify-between gap-2">
        <b class="text-[14px]">{{ step.label }}</b>
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          :disabled="disabled"
          :aria-label="`${t('wizard.edit')} ${step.label}`"
          @click="emit('edit', i)"
        >
          {{ t('wizard.edit') }}
        </UButton>
      </header>
      <dl>
        <div v-for="row in review[step.key] ?? []" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value || t('wizard.empty') }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.wz-rv {
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: var(--app-surface-2);
}
.wz-rv dl {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px 16px;
  margin: 8px 0 0;
}
.wz-rv dt {
  font-size: 12px;
  color: var(--app-muted);
}
.wz-rv dd {
  margin: 0;
  font-size: 13.5px;
  overflow-wrap: anywhere;
}
</style>

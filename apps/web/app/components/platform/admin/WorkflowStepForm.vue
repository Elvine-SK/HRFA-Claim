<script setup lang="ts">
import type { BuilderField } from '@elvine-sk/platform-nuxt/utils'
import type { DraftStep } from '../../../utils/workflowDraft'

const props = defineProps<{
  fields: Record<string, BuilderField>
  resolvers: readonly string[]
  disabled?: boolean
}>()
const step = defineModel<DraftStep>({ required: true })
const { t } = useI18n()

const hasFields = computed(() => Object.keys(props.fields).length > 0)
const stringFields = computed(() =>
  Object.entries(props.fields)
    .filter(([, f]) => f.type === 'string')
    .map(([key]) => key),
)
const completionItems = computed(() => [
  { value: 'any', label: t('admin.workflows.completion.any') },
  { value: 'all', label: t('admin.workflows.completion.all') },
])
</script>

<template>
  <div class="grid gap-3">
    <div class="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
      <UFormField :label="t('admin.workflows.stepKey')" size="sm">
        <UInput
          v-model="step.key"
          :disabled="disabled"
          size="sm"
          class="w-full"
          :ui="{ base: 'font-mono' }"
        />
      </UFormField>
      <UFormField :label="t('admin.workflows.approvers')" size="sm">
        <PlatformAdminApproverPicker
          v-model="step.approvers"
          :resolvers="resolvers"
          :string-fields="stringFields"
          :disabled="disabled"
        />
      </UFormField>
    </div>
    <div class="flex flex-wrap items-end gap-x-5 gap-y-3">
      <UFormField :label="t('admin.workflows.completion.label')" size="sm">
        <URadioGroup
          v-model="step.completion"
          :items="completionItems"
          orientation="horizontal"
          :disabled="disabled"
          size="sm"
        />
      </UFormField>
      <UFormField :label="t('admin.workflows.dueInHours')" size="sm">
        <UInputNumber
          :model-value="step.dueInHours ?? undefined"
          :min="1"
          :max="8760"
          :disabled="disabled"
          size="sm"
          class="w-44"
          :placeholder="t('admin.workflows.noDue')"
          @update:model-value="(v) => (step.dueInHours = v ?? null)"
        />
      </UFormField>
      <USwitch
        v-model="step.escalate"
        :label="t('admin.workflows.escalate')"
        :disabled="disabled || !step.dueInHours || step.completion === 'all'"
        size="sm"
      />
      <USwitch
        v-model="step.conditional"
        :label="t('admin.workflows.conditional')"
        :disabled="disabled || !hasFields"
        size="sm"
      />
      <slot name="actions" />
    </div>
    <UFormField
      v-if="step.escalate && step.dueInHours && step.completion === 'any'"
      :label="t('admin.workflows.escalateTo')"
      size="sm"
    >
      <PlatformAdminApproverPicker
        v-model="step.escalateTo"
        :resolvers="resolvers"
        :string-fields="stringFields"
        :disabled="disabled"
      />
    </UFormField>
    <div v-if="step.conditional" class="grid gap-1.5">
      <span class="text-[12.5px] font-medium">{{ t('admin.workflows.conditionLabel') }}</span>
      <PlatformAdminConditionBuilder v-model="step.tree" :fields="fields" :variables="[]" />
    </div>
  </div>
</template>

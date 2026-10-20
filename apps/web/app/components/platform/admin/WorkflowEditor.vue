<script setup lang="ts">
import type { BuilderField } from '@elvine-sk/platform-nuxt/utils'
import type { WorkflowDefinition } from '../../../types/approval'
import { fromDraftStep, nextDraftUid, toDraftStep, type DraftStep } from '../../../utils/workflowDraft'

defineProps<{
  fields: Record<string, BuilderField>
  resolvers: readonly string[]
  disabled?: boolean
}>()
const model = defineModel<WorkflowDefinition>({ required: true })
const { t } = useI18n()

interface DraftStage {
  uid: number
  key: string
  steps: DraftStep[]
}

const stages = ref<DraftStage[]>([])
const allowSelfApproval = ref(false)
let emitted = ''

function load(def: WorkflowDefinition | undefined) {
  stages.value = (def?.stages ?? []).map((stage) => ({
    uid: nextDraftUid(),
    key: stage.key,
    steps: (stage.steps ?? []).map((s, i) => toDraftStep(`step_${i + 1}`, s)),
  }))
  allowSelfApproval.value = !!def?.rules?.allowSelfApproval
}

function toDefinition(): WorkflowDefinition {
  return {
    stages: stages.value.map((stage) => ({
      key: stage.key,
      steps: stage.steps.map(fromDraftStep),
    })),
    rules: { allowSelfApproval: allowSelfApproval.value, rejectEndsRequest: true },
  }
}

watch(
  model,
  (def) => {
    if (JSON.stringify(def) !== emitted) load(def)
  },
  { immediate: true, deep: true },
)
watch(
  [stages, allowSelfApproval],
  () => {
    const def = toDefinition()
    emitted = JSON.stringify(def)
    if (emitted !== JSON.stringify(model.value)) model.value = def
  },
  { deep: true },
)

function addStage() {
  const n = stages.value.length + 1
  stages.value.push({ uid: nextDraftUid(), key: `stage_${n}`, steps: [toDraftStep('step_1')] })
}
function moveStage(index: number, dir: -1 | 1) {
  const list = stages.value.slice()
  const [item] = list.splice(index, 1)
  list.splice(index + dir, 0, item!)
  stages.value = list
}
function addStep(stage: DraftStage) {
  stage.steps.push(toDraftStep(`step_${stage.steps.length + 1}`))
}
</script>

<template>
  <div class="grid gap-4">
    <ol class="grid gap-3">
      <li v-for="(stage, si) in stages" :key="stage.uid" class="card">
        <div class="card-h gap-2">
          <span class="stage-num" aria-hidden="true">{{ si + 1 }}</span>
          <UFormField :label="t('admin.workflows.stageKey')" class="min-w-0 flex-1" size="sm">
            <UInput
              v-model="stage.key"
              :disabled="disabled"
              size="sm"
              class="w-full max-w-60"
              :ui="{ base: 'font-mono' }"
            />
          </UFormField>
          <div v-if="!disabled" class="flex shrink-0 gap-1">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-up"
              :disabled="si === 0"
              :aria-label="t('admin.workflows.moveUp')"
              @click="moveStage(si, -1)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-down"
              :disabled="si === stages.length - 1"
              :aria-label="t('admin.workflows.moveDown')"
              @click="moveStage(si, 1)"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              :disabled="stages.length === 1"
              :aria-label="t('admin.workflows.removeStage')"
              @click="stages.splice(si, 1)"
            />
          </div>
        </div>
        <div class="card-b grid gap-3">
          <p class="muted text-[12.5px]">{{ t('admin.workflows.stageHint') }}</p>
          <div v-for="(step, pi) in stage.steps" :key="step.uid" class="step">
            <PlatformAdminWorkflowStepForm
              v-model="stage.steps[pi]!"
              :fields="fields"
              :resolvers="resolvers"
              :disabled="disabled"
            >
              <template #actions>
                <UButton
                  v-if="!disabled && stage.steps.length > 1"
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-x"
                  class="ms-auto"
                  @click="stage.steps.splice(pi, 1)"
                >
                  {{ t('admin.workflows.removeStep') }}
                </UButton>
              </template>
            </PlatformAdminWorkflowStepForm>
          </div>
          <UButton
            v-if="!disabled && stage.steps.length < 10"
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-plus"
            class="justify-self-start"
            @click="addStep(stage)"
          >
            {{ t('admin.workflows.addStep') }}
          </UButton>
        </div>
      </li>
    </ol>
    <UButton
      v-if="!disabled && stages.length < 20"
      color="neutral"
      variant="outline"
      icon="i-lucide-plus"
      class="justify-self-start"
      @click="addStage"
    >
      {{ t('admin.workflows.addStage') }}
    </UButton>

    <div class="card">
      <div class="card-b grid gap-3">
        <USwitch
          v-model="allowSelfApproval"
          :disabled="disabled"
          :label="t('admin.workflows.rules.allowSelfApproval')"
          :description="t('admin.workflows.rules.allowSelfApprovalHint')"
        />
        <USwitch
          :model-value="true"
          disabled
          :label="t('admin.workflows.rules.rejectEndsRequest')"
          :description="t('admin.workflows.rules.rejectEndsRequestHint')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-num {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: var(--app-accent-soft, color-mix(in oklab, var(--app-accent) 14%, transparent));
  color: var(--app-accent);
  font-size: 12.5px;
  font-weight: 650;
}
.step {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-2, transparent);
}
</style>

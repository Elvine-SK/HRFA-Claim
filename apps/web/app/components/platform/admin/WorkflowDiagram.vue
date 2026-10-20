<script setup lang="ts">
import {
  Handle,
  MarkerType,
  Position,
  useVueFlow,
  VueFlow,
  type Edge,
  type Node,
  type NodeMouseEvent,
} from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import type { BuilderField } from '@elvine-sk/platform-nuxt/utils'
import type { ApproverSpec, WorkflowDefinition, WorkflowStep } from '../../../types/approval'
import { fromDraftStep, toDraftStep, type DraftStep } from '../../../utils/workflowDraft'

const props = defineProps<{
  fields: Record<string, BuilderField>
  resolvers: readonly string[]
  disabled?: boolean
  /** Validation messages (`stages.0.steps.1.key: ...`); the matching stage or step is marked. */
  issues?: readonly string[]
}>()
const model = defineModel<WorkflowDefinition>({ required: true })
const { t } = useI18n()
const access = useAccess()
const confirm = useConfirm()
const flowId = useId()
const { fitView } = useVueFlow(flowId)

// Layout comes from the definition: stages are columns in order, their steps stack (they run in parallel).
const STAGE_W = 260
const HEADER = 48
const STEP_H = 88
const GAP = 10
const COL_GAP = 96
const TERM_H = 40

const stages = computed(() => model.value.stages ?? [])
const heights = computed(() =>
  stages.value.map((s) => HEADER + Math.max(1, s.steps.length) * (STEP_H + GAP) + GAP),
)
const tallest = computed(() => Math.max(HEADER + STEP_H + 2 * GAP, ...heights.value))
const height = computed(() => Math.min(640, Math.max(300, tallest.value + 96)))

const errorAt = computed(() => {
  const stageErrors = new Set<number>()
  const stepErrors = new Set<string>()
  for (const message of props.issues ?? []) {
    const hit = /^stages\.(\d+)(?:\.steps\.(\d+))?/.exec(message)
    if (!hit) continue
    if (hit[2] === undefined) stageErrors.add(Number(hit[1]))
    else stepErrors.add(`${hit[1]}-${hit[2]}`)
  }
  return { stageErrors, stepErrors }
})

const nodes = computed<Node[]>(() => {
  const mid = tallest.value / 2
  const out: Node[] = [
    { id: 'start', type: 'terminal', position: { x: 0, y: mid - TERM_H / 2 }, data: { kind: 'start' } },
  ]
  let x = 170
  stages.value.forEach((stage, si) => {
    const h = heights.value[si]!
    const id = `stage-${si}`
    out.push({
      id,
      type: 'stage',
      position: { x, y: mid - h / 2 },
      data: { si, stage, error: errorAt.value.stageErrors.has(si) },
      style: { width: `${STAGE_W}px`, height: `${h}px` },
    })
    stage.steps.forEach((step, pi) =>
      out.push({
        id: `step-${si}-${pi}`,
        type: 'step',
        parentNode: id,
        extent: 'parent',
        position: { x: GAP, y: HEADER + pi * (STEP_H + GAP) },
        data: { si, pi, step, error: errorAt.value.stepErrors.has(`${si}-${pi}`) },
        style: { width: `${STAGE_W - 2 * GAP}px`, height: `${STEP_H}px` },
      }),
    )
    x += STAGE_W + COL_GAP
  })
  out.push({ id: 'end', type: 'terminal', position: { x, y: mid - TERM_H / 2 }, data: { kind: 'end' } })
  return out
})

const edges = computed<Edge[]>(() => {
  const ids = ['start', ...stages.value.map((_, i) => `stage-${i}`), 'end']
  return ids.slice(1).map((target, i) => ({
    id: `edge-${i}`,
    source: ids[i]!,
    target,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
  }))
})

watch(
  () => stages.value.map((s) => s.steps.length).join(','),
  () => nextTick(() => fitView({ padding: 0.15 })),
)

const fullscreen = ref(false)
watch(fullscreen, () => nextTick(() => fitView({ padding: 0.15 })))
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && fullscreen.value && !stepOpen.value && !stageOpen.value) fullscreen.value = false
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ── Approver labels ──────────────────────────────────────────────────

const roles = useAllRoles(() => access.can('role.read'))
const groups = useAllGroups(() => access.can('group.read'))
const roleNames = computed(() => new Map((roles.data.value ?? []).map((r) => [r.key, r.name])))
const groupNames = computed(() => new Map((groups.data.value ?? []).map((g) => [g.key, g.name])))
const APPROVER_ICONS = {
  role: 'i-lucide-shield',
  group: 'i-lucide-users',
  user: 'i-lucide-user',
  resolver: 'i-lucide-git-fork',
} as const

function approver(a: ApproverSpec) {
  const [kind, value] = (Object.entries(a)[0] ?? ['role', '']) as [keyof typeof APPROVER_ICONS, string]
  const named =
    kind === 'role'
      ? roleNames.value.get(value)
      : kind === 'group'
        ? groupNames.value.get(value)
        : kind === 'user'
          ? t('admin.workflows.approver.user')
          : value
  return {
    icon: APPROVER_ICONS[kind] ?? APPROVER_ICONS.role,
    text: value ? (named ?? value) : t('admin.workflows.diagram.noApprover'),
    missing: !value,
  }
}

// ── Edits: each one replaces the draft, so Structured and JSON stay in step ──

function update(change: (def: WorkflowDefinition) => void) {
  const def = JSON.parse(JSON.stringify(model.value)) as WorkflowDefinition
  change(def)
  model.value = def
}
const blankStep = (key: string): WorkflowStep => ({ key, approvers: { role: '' }, completion: 'any' })
function freeKey(prefix: string, taken: string[]) {
  let n = taken.length + 1
  while (taken.includes(`${prefix}_${n}`)) n++
  return `${prefix}_${n}`
}

function moveStage(si: number, dir: -1 | 1) {
  update((def) => {
    const [stage] = def.stages.splice(si, 1)
    def.stages.splice(si + dir, 0, stage!)
  })
}
function insertStage(si: number) {
  update((def) => {
    const key = freeKey(
      'stage',
      def.stages.map((s) => s.key),
    )
    def.stages.splice(si + 1, 0, { key, steps: [blankStep('step_1')] })
  })
}
function addStep(si: number) {
  update((def) => {
    const steps = def.stages[si]!.steps
    steps.push(
      blankStep(
        freeKey(
          'step',
          steps.map((s) => s.key),
        ),
      ),
    )
  })
}

const editingStep = ref<{ si: number; pi: number; step: DraftStep } | null>(null)
const stepOpen = computed({
  get: () => !!editingStep.value,
  set: (open) => {
    if (!open) editingStep.value = null
  },
})
// A node-click listener is also what gives Vue Flow nodes pointer events when they can't be dragged.
function onNodeClick({ node }: NodeMouseEvent) {
  if (node.type === 'step') openStep(node.data.si, node.data.pi)
}
function openStep(si: number, pi: number) {
  editingStep.value = { si, pi, step: toDraftStep('', stages.value[si]!.steps[pi]) }
}
function applyStep() {
  const e = editingStep.value
  if (!e) return
  update((def) => {
    def.stages[e.si]!.steps[e.pi] = fromDraftStep(e.step)
  })
  editingStep.value = null
}
function removeStep() {
  const e = editingStep.value
  if (!e) return
  update((def) => void def.stages[e.si]!.steps.splice(e.pi, 1))
  editingStep.value = null
}

const editingStage = ref<{ si: number; key: string } | null>(null)
const stageOpen = computed({
  get: () => !!editingStage.value,
  set: (open) => {
    if (!open) editingStage.value = null
  },
})
function openStage(si: number) {
  editingStage.value = { si, key: stages.value[si]!.key }
}
function applyStage() {
  const e = editingStage.value
  if (!e) return
  update((def) => {
    def.stages[e.si]!.key = e.key.trim()
  })
  editingStage.value = null
}
async function removeStage(si: number) {
  const stage = stages.value[si]
  if (!stage) return
  const ok = await confirm({
    title: t('platform.confirm.deleteTitle', { name: stage.key || t('admin.workflows.stageKey') }),
    description: t('admin.workflows.diagram.removeStageText', { n: stage.steps.length }),
    confirmLabel: t('admin.workflows.removeStage'),
    danger: true,
  })
  if (!ok) return
  update((def) => void def.stages.splice(si, 1))
  editingStage.value = null
}
</script>

<template>
  <div class="grid gap-2">
    <Teleport to="body" :disabled="!fullscreen">
      <div :class="{ 'wfd-full': fullscreen }">
        <div class="wfd" :style="fullscreen ? undefined : { height: `${height}px` }">
          <VueFlow
            :id="flowId"
            :nodes="nodes"
            :edges="edges"
            :nodes-draggable="false"
            :nodes-connectable="false"
            :elements-selectable="false"
            :zoom-on-scroll="false"
            :zoom-on-double-click="false"
            :prevent-scrolling="false"
            :min-zoom="0.3"
            :max-zoom="1.25"
            fit-view-on-init
            @node-click="onNodeClick"
          >
            <template #node-terminal="{ data }">
              <div class="wfd-term" :class="`is-${data.kind}`">
                <UIcon
                  :name="data.kind === 'start' ? 'i-lucide-send' : 'i-lucide-badge-check'"
                  class="size-4"
                />
                {{ t(`admin.workflows.diagram.${data.kind}`) }}
                <Handle v-if="data.kind === 'start'" type="source" :position="Position.Right" />
                <Handle v-else type="target" :position="Position.Left" />
              </div>
            </template>

            <template #node-stage="{ data }">
              <div class="wfd-stage" :class="{ 'is-error': data.error }">
                <Handle type="target" :position="Position.Left" />
                <div class="wfd-stage-h">
                  <span class="wfd-num" aria-hidden="true">{{ data.si + 1 }}</span>
                  <button
                    type="button"
                    class="wfd-stage-key nodrag"
                    :aria-label="`${t('admin.workflows.stageKey')}: ${data.stage.key}`"
                    @click="openStage(data.si)"
                  >
                    {{ data.stage.key || '—' }}
                  </button>
                  <div v-if="!disabled" class="nodrag ms-auto flex gap-0.5">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-arrow-left"
                      :disabled="data.si === 0"
                      :aria-label="t('admin.workflows.diagram.moveEarlier')"
                      @click="moveStage(data.si, -1)"
                    />
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-arrow-right"
                      :disabled="data.si === stages.length - 1"
                      :aria-label="t('admin.workflows.diagram.moveLater')"
                      @click="moveStage(data.si, 1)"
                    />
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-plus"
                      :disabled="data.stage.steps.length >= 10"
                      :aria-label="t('admin.workflows.addStep')"
                      @click="addStep(data.si)"
                    />
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-list-plus"
                      :disabled="stages.length >= 20"
                      :aria-label="t('admin.workflows.diagram.insertStage')"
                      @click="insertStage(data.si)"
                    />
                    <UButton
                      size="xs"
                      color="error"
                      variant="ghost"
                      icon="i-lucide-trash-2"
                      :disabled="stages.length <= 1"
                      :aria-label="t('admin.workflows.removeStage')"
                      @click="removeStage(data.si)"
                    />
                  </div>
                </div>
                <Handle type="source" :position="Position.Right" />
              </div>
            </template>

            <template #node-step="{ data }">
              <button
                type="button"
                class="wfd-step nodrag"
                :class="{ 'is-error': data.error }"
                :aria-label="`${t('admin.workflows.stepKey')}: ${data.step.key}`"
              >
                <b class="truncate font-mono text-[12.5px]">{{ data.step.key || '—' }}</b>
                <span class="wfd-approver" :class="{ 'is-missing': approver(data.step.approvers).missing }">
                  <UIcon :name="approver(data.step.approvers).icon" class="size-3.5 shrink-0" />
                  <span class="truncate">{{ approver(data.step.approvers).text }}</span>
                </span>
                <span class="wfd-badges">
                  <span class="wfd-badge">{{
                    t(`admin.workflows.diagram.${data.step.completion === 'all' ? 'all' : 'any'}`)
                  }}</span>
                  <span v-if="data.step.dueInHours" class="wfd-badge">
                    <UIcon name="i-lucide-clock" class="size-3" />
                    {{ t('admin.workflows.diagram.due', { n: data.step.dueInHours }) }}
                  </span>
                  <span v-if="data.step.escalateTo" class="wfd-badge" :title="t('admin.workflows.escalate')">
                    <UIcon name="i-lucide-siren" class="size-3" />
                  </span>
                  <span
                    v-if="data.step.condition"
                    class="wfd-badge"
                    :title="t('admin.workflows.conditional')"
                  >
                    <UIcon name="i-lucide-filter" class="size-3" />
                  </span>
                </span>
              </button>
            </template>
          </VueFlow>
          <div class="wfd-tools">
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-scan"
              :aria-label="t('admin.workflows.diagram.fit')"
              @click="fitView({ padding: 0.15 })"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :icon="fullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
              :aria-label="t(`admin.workflows.diagram.${fullscreen ? 'exitFullscreen' : 'fullscreen'}`)"
              @click="fullscreen = !fullscreen"
            />
          </div>
        </div>
        <div v-if="fullscreen && $slots.aside" class="wfd-aside">
          <slot name="aside" />
        </div>
      </div>
    </Teleport>
    <p class="muted text-[12.5px]">{{ t('admin.workflows.diagram.hint') }}</p>

    <USlideover
      v-model:open="stepOpen"
      :title="t('admin.workflows.diagram.editStep')"
      :description="editingStep ? stages[editingStep.si]?.key : undefined"
      :ui="{ content: 'max-w-xl' }"
    >
      <template #body>
        <PlatformAdminWorkflowStepForm
          v-if="editingStep"
          v-model="editingStep.step"
          :fields="fields"
          :resolvers="resolvers"
          :disabled="disabled"
        />
      </template>
      <template #footer>
        <div class="flex w-full items-center gap-2">
          <UButton
            v-if="!disabled && editingStep && (stages[editingStep.si]?.steps.length ?? 0) > 1"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            @click="removeStep"
          >
            {{ t('admin.workflows.removeStep') }}
          </UButton>
          <div class="ms-auto flex gap-2">
            <UButton color="neutral" variant="ghost" @click="stepOpen = false">
              {{ t(disabled ? 'platform.actions.close' : 'platform.actions.cancel') }}
            </UButton>
            <UButton v-if="!disabled" @click="applyStep">{{ t('platform.actions.apply') }}</UButton>
          </div>
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="stageOpen" :title="t('admin.workflows.diagram.editStage')">
      <template #body>
        <UFormField v-if="editingStage" :label="t('admin.workflows.stageKey')">
          <UInput
            v-model="editingStage.key"
            :disabled="disabled"
            class="w-full"
            :ui="{ base: 'font-mono' }"
            autofocus
            @keydown.enter.prevent="applyStage"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full items-center gap-2">
          <UButton
            v-if="!disabled && stages.length > 1"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            @click="editingStage && removeStage(editingStage.si)"
          >
            {{ t('admin.workflows.removeStage') }}
          </UButton>
          <div class="ms-auto flex gap-2">
            <UButton color="neutral" variant="ghost" @click="stageOpen = false">
              {{ t(disabled ? 'platform.actions.close' : 'platform.actions.cancel') }}
            </UButton>
            <UButton v-if="!disabled" @click="applyStage">{{ t('platform.actions.apply') }}</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.wfd {
  position: relative;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-lg);
  background-color: var(--app-surface);
  background-image: radial-gradient(var(--app-border) 1px, transparent 1px);
  background-size: 16px 16px;
  overflow: hidden;
}
.wfd-full {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  background: var(--app-bg);
}
.wfd-full .wfd {
  height: 100%;
  border: 0;
  border-radius: 0;
}
.wfd-aside {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 20px 16px;
  overflow-y: auto;
  border-inline-start: 1px solid var(--app-border);
  background: var(--app-bg);
}
@media (max-width: 900px) {
  .wfd-full {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .wfd-aside {
    max-height: 40vh;
    border-inline-start: 0;
    border-block-start: 1px solid var(--app-border);
  }
}
.wfd-tools {
  position: absolute;
  inset-block-end: 10px;
  inset-inline-end: 10px;
  display: flex;
  gap: 6px;
}
.wfd :deep(.vue-flow__handle) {
  opacity: 0;
  pointer-events: none;
}
.wfd :deep(.vue-flow__edge-path) {
  stroke: var(--app-muted);
  stroke-width: 1.5;
}
.wfd :deep(.vue-flow__node) {
  cursor: default;
}
.wfd-term {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
}
.wfd-term.is-end {
  color: var(--app-ok);
}
.wfd-stage {
  width: 100%;
  height: 100%;
  border: 1px dashed color-mix(in oklab, var(--app-accent) 45%, var(--app-border));
  border-radius: 12px;
  background: color-mix(in oklab, var(--app-accent) 5%, transparent);
}
.wfd-stage.is-error,
.wfd-step.is-error {
  border-color: var(--app-bad);
  border-style: solid;
}
.wfd-stage-h {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 48px;
  padding: 0 6px 0 10px;
}
.wfd-num {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--app-accent);
  background: color-mix(in oklab, var(--app-accent) 14%, transparent);
}
.wfd-stage-key {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--app-mono);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.wfd-stage-key:hover {
  text-decoration: underline;
}
.wfd-step {
  display: grid;
  align-content: start;
  gap: 4px;
  width: 100%;
  height: 100%;
  padding: 9px 11px;
  text-align: start;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.wfd-step:hover,
.wfd-step:focus-visible {
  border-color: var(--app-accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--app-accent) 18%, transparent);
}
.wfd-approver {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 12.5px;
  color: var(--app-muted);
}
.wfd-approver.is-missing {
  color: var(--app-bad);
}
.wfd-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.wfd-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--app-muted);
  background: color-mix(in oklab, var(--app-muted) 12%, transparent);
}
</style>

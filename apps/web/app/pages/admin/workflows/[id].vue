<script setup lang="ts">
import type { BuilderField } from '@elvine-sk/platform-nuxt/utils'
import type { ApprovalEntities, WorkflowDefinition, WorkflowDetail } from '../../../types/approval'

definePageMeta({ title: 'admin.workflows.detail', permission: 'approval_workflow.read' })

const { t } = useI18n()
const route = useRoute()
const { dateTime, relative } = useDates()
const notify = useNotify()
const confirm = useConfirm()
const access = useAccess()
const api = useApi()
const action = useAdminAction()
const entityNames = useApprovalEntityRegistry()

const id = computed(() => String(route.params.id))
const detail = useApiItem<WorkflowDetail>(ADMIN_KEY, () => `/approval/workflows/${id.value}`)
const wf = computed(() => detail.data.value)
const entities = useApiItem<ApprovalEntities>(ADMIN_KEY, '/approval/entities', { staleTime: 5 * 60_000 })
const entity = computed(() => entities.data.value?.entities.find((e) => e.type === wf.value?.entityType))
const fields = computed(() => (entity.value?.fields ?? {}) as Record<string, BuilderField>)
const resolvers = computed(() => entities.data.value?.resolvers ?? [])
const editable = computed(() => access.can('approval_workflow.manage'))

useHead({ title: () => wf.value?.name ?? t('admin.nav.workflows') })

const versions = computed(() => [...(wf.value?.versions ?? [])].sort((a, b) => b.version - a.version))
const viewing = useQueryParam('version')
const base = computed(
  () =>
    versions.value.find((v) => v.id === viewing.value) ??
    versions.value.find((v) => v.id === wf.value?.activeVersionId) ??
    versions.value[0],
)

const summary = computed(() => [
  { key: 'key', label: t('admin.workflows.key'), value: wf.value?.key },
  { key: 'state', label: t('admin.workflows.state') },
  {
    key: 'version',
    label: t('admin.workflows.version'),
    value: base.value
      ? t(dirty.value ? 'admin.workflows.basedOn' : 'admin.workflows.viewing', { n: base.value.version })
      : t('admin.workflows.noVersions'),
  },
])

const starter = (): WorkflowDefinition => ({
  stages: [{ key: 'review', steps: [{ key: 'manager', approvers: { role: '' }, completion: 'any' }] }],
  rules: { allowSelfApproval: false, rejectEndsRequest: true },
})
const draft = ref<WorkflowDefinition>(starter())
const baseline = ref('')
const validation = ref<{ ok: boolean; messages: string[] } | null>(null)
const validating = ref(false)
const reset = () => {
  draft.value = structuredClone(
    toRaw((base.value?.definition as WorkflowDefinition | undefined) ?? starter()),
  )
  baseline.value = JSON.stringify(draft.value)
  jsonText.value = JSON.stringify(draft.value, null, 2)
  validation.value = null
}
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value)

const mode = ref<'structured' | 'diagram' | 'json'>('structured')
const modes = computed(() => [
  { value: 'structured', label: t('admin.workflows.structured'), icon: 'i-lucide-list-tree' },
  { value: 'diagram', label: t('admin.workflows.diagram.label'), icon: 'i-lucide-workflow' },
  { value: 'json', label: 'JSON', icon: 'i-lucide-braces' },
])
const jsonText = ref('')
const jsonError = ref<string | null>(null)
watch(jsonText, (text) => {
  if (mode.value !== 'json') return
  try {
    draft.value = JSON.parse(text) as WorkflowDefinition
    jsonError.value = null
  } catch (error) {
    jsonError.value = (error as Error).message
  }
})
watch(mode, (m) => {
  if (m === 'json') jsonText.value = JSON.stringify(draft.value, null, 2)
  jsonError.value = null
})
watch(
  () => base.value?.id ?? `none:${wf.value?.id ?? ''}`,
  () => wf.value && reset(),
  { immediate: true },
)

const errors = useFormErrors()
function issues(error: unknown) {
  const list = fieldErrorsOf(error).map(
    (f) => `${f.path.replace(/^definition\.?/, '') || '—'}: ${errors.translate(f.code, f.message)}`,
  )
  return list.length ? list : [notify.messageOf(error)]
}
async function validate() {
  if (!wf.value || jsonError.value) return false
  validating.value = true
  try {
    await api('/approval/workflows/validate', {
      method: 'POST',
      body: { entityType: wf.value.entityType, definition: draft.value },
    })
    validation.value = { ok: true, messages: [] }
    return true
  } catch (error) {
    validation.value = { ok: false, messages: issues(error) }
    return false
  } finally {
    validating.value = false
  }
}

async function save(activate: boolean) {
  if (!wf.value || jsonError.value) return
  if (activate) {
    const ok = await confirm({
      title: t('admin.workflows.activateTitle'),
      description: t('admin.workflows.activateText'),
      confirmLabel: t('admin.workflows.saveActivate'),
    })
    if (!ok) return
  }
  try {
    const next = (await action.mutateAsync({
      path: `/approval/workflows/${wf.value.id}/versions`,
      body: { definition: draft.value, activate },
    })) as WorkflowDetail
    const newest = [...next.versions].sort((a, b) => b.version - a.version)[0]
    baseline.value = JSON.stringify(draft.value)
    viewing.value = newest?.id
    validation.value = { ok: true, messages: [] }
    notify.success(
      t(activate ? 'admin.workflows.activated' : 'admin.workflows.versionSaved', {
        n: newest?.version ?? '',
      }),
    )
  } catch (error) {
    validation.value = { ok: false, messages: issues(error) }
  }
}

async function activate(versionId: string, version: number) {
  if (!wf.value) return
  const ok = await confirm({
    title: t('admin.workflows.activateTitle'),
    description: t('admin.workflows.activateVersionText', { n: version }),
    confirmLabel: t('admin.workflows.activate'),
  })
  if (!ok) return
  try {
    await action.mutateAsync({ path: `/approval/workflows/${wf.value.id}/activate`, body: { versionId } })
    notify.success(t('admin.workflows.activated', { n: version }))
  } catch (error) {
    notify.error(error)
  }
}

const shippedNote = computed(() => {
  switch (wf.value?.shippedStatus) {
    case 'edited':
      return t('admin.workflows.shippedEdited')
    case 'inactive':
      return t('admin.workflows.shippedInactive')
    case 'outdated':
      return t('admin.workflows.shippedOutdated')
    default:
      return null
  }
})
const canUseShipped = computed(
  () => editable.value && (wf.value?.shippedStatus === 'edited' || wf.value?.shippedStatus === 'inactive'),
)
async function useShipped() {
  if (!wf.value) return
  const ok = await confirm({
    title: t('admin.workflows.useShipped'),
    description: t('admin.workflows.useShippedConfirm'),
    confirmLabel: t('admin.workflows.useShipped'),
  })
  if (!ok) return
  try {
    const next = (await action.mutateAsync({
      path: `/approval/workflows/${wf.value.id}/use-shipped`,
    })) as WorkflowDetail
    viewing.value = next.activeVersionId ?? undefined
    notify.success(t('admin.workflows.useShippedDone'))
  } catch (error) {
    notify.error(error)
  }
}

onBeforeRouteLeave(async () => {
  if (!dirty.value || !editable.value) return true
  return confirm({
    title: t('admin.roles.leaveTitle'),
    description: t('admin.roles.leaveText'),
    confirmLabel: t('admin.roles.leave'),
    danger: true,
  })
})
</script>

<template>
  <div>
    <UButton
      to="/admin/workflows"
      color="neutral"
      variant="link"
      icon="i-lucide-arrow-left"
      class="mb-1 -ms-2.5 px-2.5"
    >
      {{ t('admin.workflows.title') }}
    </UButton>
    <PlatformPageHeader
      :eyebrow="wf ? entityNames.label(wf.entityType) : t('admin.nav.group')"
      :title="wf?.name ?? t('admin.workflows.title')"
      :subtitle="wf?.key"
    >
      <template v-if="wf" #actions>
        <UBadge v-if="wf.shipped" color="neutral" variant="subtle">{{ t('admin.workflows.shipped') }}</UBadge>
        <PlatformStatusBadge
          :tone="wf.activeVersionId ? 'success' : 'neutral'"
          :label="wf.activeVersionId ? t('admin.workflows.live') : t('admin.workflows.inactive')"
        />
      </template>
    </PlatformPageHeader>

    <UAlert
      v-if="wf && shippedNote"
      class="mb-4"
      color="warning"
      variant="subtle"
      icon="i-lucide-package"
      :title="shippedNote"
      role="status"
    >
      <template v-if="canUseShipped" #actions>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          :loading="action.isPending.value"
          @click="useShipped"
        >
          {{ t('admin.workflows.useShipped') }}
        </UButton>
      </template>
    </UAlert>

    <PlatformEmptyState
      v-if="detail.error.value"
      kind="no-results"
      icon="i-lucide-circle-alert"
      tone="danger"
      :title="t('platform.errors.generic')"
      :text="notify.messageOf(detail.error.value)"
    />
    <div v-else-if="!wf" class="grid gap-3">
      <USkeleton class="h-40 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <div v-else class="wf-grid">
      <div class="wf-side grid content-start gap-4 self-start">
        <aside class="card">
          <div class="card-h">
            <h2 class="text-[14px] font-semibold">{{ t('admin.workflows.versions') }}</h2>
          </div>
          <ul v-if="versions.length" class="card-list">
            <li v-for="v in versions" :key="v.id" class="ver" :class="{ 'is-on': base?.id === v.id }">
              <button
                type="button"
                class="ver-main"
                :aria-current="base?.id === v.id ? 'true' : undefined"
                @click="viewing = v.id"
              >
                <span class="font-mono text-[13px] font-semibold">v{{ v.version }}</span>
                <time class="muted text-[12px]" :datetime="v.createdAt" :title="dateTime(v.createdAt)">{{
                  relative(v.createdAt)
                }}</time>
              </button>
              <PlatformStatusBadge
                v-if="v.id === wf.activeVersionId"
                tone="success"
                :label="t('admin.workflows.active')"
              />
              <UButton
                v-else-if="editable"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="activate(v.id, v.version)"
              >
                {{ t('admin.workflows.activate') }}
              </UButton>
            </li>
          </ul>
          <div v-else class="card-b">
            <p class="muted text-[13px]">{{ t('admin.workflows.noVersions') }}</p>
          </div>
        </aside>
        <PlatformAdminWorkflowSettings
          :workflow="wf"
          :editable="editable"
          @activate="base && activate(base.id, base.version)"
        />
      </div>

      <section class="grid min-w-0 gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <PlatformSegmented v-model="mode" :options="modes" :label="t('admin.workflows.editorMode')" />
          <span v-if="base" class="muted text-[12.5px]">
            {{
              dirty
                ? t('admin.workflows.basedOn', { n: base.version })
                : t('admin.workflows.viewing', { n: base.version })
            }}
          </span>
          <UButton
            v-if="dirty"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-undo-2"
            @click="reset"
          >
            {{ t('admin.workflows.discard') }}
          </UButton>
        </div>

        <UAlert
          v-if="validation"
          :color="validation.ok ? 'success' : 'error'"
          variant="subtle"
          :icon="validation.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
          :title="validation.ok ? t('admin.workflows.valid') : t('admin.workflows.invalid')"
          role="status"
        >
          <template v-if="validation.messages.length" #description>
            <ul class="grid gap-0.5 font-mono text-[12.5px]">
              <li v-for="m in validation.messages" :key="m">{{ m }}</li>
            </ul>
          </template>
        </UAlert>

        <PlatformAdminWorkflowEditor
          v-if="mode === 'structured'"
          v-model="draft"
          :fields="fields"
          :resolvers="resolvers"
          :disabled="!editable"
        />
        <PlatformAdminWorkflowDiagram
          v-else-if="mode === 'diagram'"
          v-model="draft"
          :fields="fields"
          :resolvers="resolvers"
          :disabled="!editable"
          :issues="validation?.ok === false ? validation.messages : []"
        >
          <template #aside>
            <div class="grid gap-1">
              <span class="eyebrow">{{ entityNames.label(wf.entityType) }}</span>
              <h2 class="text-[17px] font-bold">{{ wf.name }}</h2>
            </div>
            <PlatformKeyValue :items="summary">
              <template #key="{ item }">
                <code>{{ item.value }}</code>
              </template>
              <template #state>
                <PlatformStatusBadge
                  :tone="wf.activeVersionId ? 'success' : 'neutral'"
                  :label="wf.activeVersionId ? t('admin.workflows.live') : t('admin.workflows.inactive')"
                />
              </template>
            </PlatformKeyValue>
            <UAlert
              v-if="validation"
              :color="validation.ok ? 'success' : 'error'"
              variant="subtle"
              :icon="validation.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
              :title="validation.ok ? t('admin.workflows.valid') : t('admin.workflows.invalid')"
            >
              <template v-if="validation.messages.length" #description>
                <ul class="grid gap-0.5 font-mono text-[12px]">
                  <li v-for="m in validation.messages" :key="m">{{ m }}</li>
                </ul>
              </template>
            </UAlert>
            <UButton
              v-if="editable"
              color="neutral"
              variant="outline"
              icon="i-lucide-shield-check"
              block
              :loading="validating"
              @click="validate"
            >
              {{ t('admin.workflows.validate') }}
            </UButton>
            <PlatformAdminWorkflowFacts v-if="entity" :fields="fields" :resolvers="resolvers" default-open />
          </template>
        </PlatformAdminWorkflowDiagram>
        <UFormField v-else :error="jsonError ?? undefined" :hint="t('admin.workflows.jsonHint')">
          <UTextarea
            v-model="jsonText"
            aria-label="JSON"
            :rows="22"
            autoresize
            :maxrows="40"
            spellcheck="false"
            class="w-full"
            :disabled="!editable"
            :ui="{ base: 'font-mono text-[12.5px] leading-relaxed' }"
          />
        </UFormField>

        <PlatformAdminWorkflowFacts v-if="entity" :fields="fields" :resolvers="resolvers" />

        <div v-if="editable" class="savebar">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-shield-check"
            :loading="validating"
            :disabled="!!jsonError"
            @click="validate"
          >
            {{ t('admin.workflows.validate') }}
          </UButton>
          <div class="ms-auto flex flex-wrap gap-2">
            <UButton
              color="neutral"
              variant="soft"
              :loading="action.isPending.value"
              :disabled="!!jsonError"
              @click="save(false)"
            >
              {{ t('admin.workflows.saveVersion') }}
            </UButton>
            <UButton
              icon="i-lucide-rocket"
              :loading="action.isPending.value"
              :disabled="!!jsonError"
              @click="save(true)"
            >
              {{ t('admin.workflows.saveActivate') }}
            </UButton>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wf-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--app-gap);
}
@media (min-width: 1024px) {
  .wf-grid {
    grid-template-columns: 260px minmax(0, 1fr);
  }
  .wf-side {
    position: sticky;
    top: calc(var(--app-topbar-h) + 12px);
  }
}
.ver {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-inline-end: 12px;
  border-inline-start: 3px solid transparent;
}
.ver-main {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: baseline;
  gap: 10px;
  padding: 10px 0 10px 12px;
  text-align: start;
}
.ver:hover {
  background: var(--app-hover);
}
.ver.is-on {
  border-inline-start-color: var(--app-accent);
  background: var(--app-hover);
}
.savebar {
  position: sticky;
  bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: color-mix(in oklab, var(--app-surface) 92%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px -18px rgb(0 0 0 / 0.35);
}
</style>

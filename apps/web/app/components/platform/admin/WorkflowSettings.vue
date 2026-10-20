<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import type { WorkflowDetail } from '../../../types/approval'

/**
 * Workflow-level settings (not versioned): description, who may choose it, default for its type, deactivate,
 * and delete once it is not live.
 */
const props = defineProps<{ workflow: WorkflowDetail; editable: boolean }>()
// Activating needs a version; the page activates the one being viewed (with its own confirmation).
const emit = defineEmits<{ activate: [] }>()
const { t } = useI18n()
const notify = useNotify()
const confirm = useConfirm()
const action = useAdminAction()
const api = useApi()
const queryClient = useQueryClient()
const entityNames = useApprovalEntityRegistry()

const form = reactive({ description: '', roles: [] as string[], groups: [] as string[] })
const reset = () =>
  Object.assign(form, {
    description: props.workflow.description ?? '',
    roles: [...props.workflow.audience.roles],
    groups: [...props.workflow.audience.groups],
  })
watch(() => props.workflow, reset, { immediate: true })
const dirty = computed(
  () =>
    form.description.trim() !== (props.workflow.description ?? '') ||
    JSON.stringify(form.roles) !== JSON.stringify(props.workflow.audience.roles) ||
    JSON.stringify(form.groups) !== JSON.stringify(props.workflow.audience.groups),
)
const live = computed(() => !!props.workflow.activeVersionId)
const base = computed(() => `/approval/workflows/${props.workflow.id}`)

async function save() {
  try {
    await action.mutateAsync({
      path: base.value,
      method: 'PATCH',
      body: { description: form.description, audience: { roles: form.roles, groups: form.groups } },
    })
    notify.success(t('admin.workflows.settingsSaved'))
  } catch (error) {
    notify.error(error)
  }
}
async function setDefault(isDefault: boolean) {
  try {
    await action.mutateAsync({ path: `${base.value}/default`, method: 'PUT', body: { isDefault } })
  } catch (error) {
    notify.error(error)
  }
}
async function deactivate() {
  const ok = await confirm({
    title: t('admin.workflows.deactivateTitle'),
    description: t('admin.workflows.deactivateText'),
    confirmLabel: t('admin.workflows.deactivate'),
    danger: true,
  })
  if (!ok) return
  try {
    await action.mutateAsync({ path: `${base.value}/deactivate` })
    notify.success(t('admin.workflows.deactivated'))
  } catch (error) {
    notify.error(error)
  }
}
async function remove() {
  const ok = await confirm({
    title: t('admin.workflows.deleteTitle', { name: props.workflow.name }),
    description: t('admin.workflows.deleteText', { key: props.workflow.key }),
    confirmLabel: t('platform.actions.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    // Leave the page before the lists reload: this page would ask for the workflow again and get 404.
    await api(base.value, { method: 'DELETE' })
    notify.success(t('admin.workflows.deleted'))
    await navigateTo('/admin/workflows')
    await queryClient.invalidateQueries({ queryKey: [ADMIN_KEY] })
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <section class="card" data-testid="workflow-settings">
    <div class="card-h">
      <h2 class="text-[14px] font-semibold">{{ t('admin.workflows.settings') }}</h2>
    </div>
    <div class="card-b grid gap-4">
      <UFormField :label="t('admin.workflows.description')" :help="t('admin.workflows.descriptionHint')">
        <UTextarea
          v-model="form.description"
          :maxlength="500"
          :rows="3"
          autoresize
          class="w-full"
          :disabled="!editable"
        />
      </UFormField>
      <UFormField :label="t('admin.workflows.availableTo')" :help="t('admin.workflows.availableToHint')">
        <div class="grid gap-2">
          <PlatformAdminRoleGroupPicker
            v-model="form.roles"
            kind="role"
            by="key"
            multiple
            :placeholder="t('admin.workflows.roles')"
            :aria-label="t('admin.workflows.roles')"
            :disabled="!editable"
            class="w-full"
          />
          <PlatformAdminRoleGroupPicker
            v-model="form.groups"
            kind="group"
            by="key"
            multiple
            :placeholder="t('admin.workflows.groups')"
            :aria-label="t('admin.workflows.groups')"
            :disabled="!editable"
            class="w-full"
          />
        </div>
      </UFormField>
      <UButton
        v-if="editable"
        size="sm"
        class="justify-self-start"
        :disabled="!dirty"
        :loading="action.isPending.value"
        @click="save"
      >
        {{ t('admin.workflows.saveSettings') }}
      </UButton>
      <USeparator />
      <UTooltip :text="live ? t('admin.workflows.defaultHint') : t('admin.workflows.defaultNeedsLive')">
        <USwitch
          :model-value="workflow.isDefault"
          :label="t('admin.workflows.isDefault', { type: entityNames.label(workflow.entityType) })"
          :disabled="!editable || (!live && !workflow.isDefault)"
          @update:model-value="setDefault"
        />
      </UTooltip>
      <UButton
        v-if="editable && live"
        size="sm"
        color="error"
        variant="outline"
        icon="i-lucide-power"
        class="justify-self-start"
        @click="deactivate"
      >
        {{ t('admin.workflows.deactivate') }}
      </UButton>
      <UButton
        v-else-if="editable && workflow.versions.length"
        size="sm"
        variant="outline"
        icon="i-lucide-rocket"
        class="justify-self-start"
        @click="emit('activate')"
      >
        {{ t('admin.workflows.activate') }}
      </UButton>
      <UButton
        v-if="editable && !live"
        size="sm"
        color="error"
        variant="ghost"
        icon="i-lucide-trash-2"
        class="justify-self-start"
        data-testid="workflow-delete"
        @click="remove"
      >
        {{ t('admin.workflows.delete') }}
      </UButton>
    </div>
  </section>
</template>

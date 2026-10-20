<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const theme = useTheme()
const access = useAccess()
const notify = useNotify()

// Joined, because the i18n check takes any quoted `appearance.…` for a message key.
const MANAGE_PERMISSION = ['appearance', 'manage'].join('.')
const canManage = computed(() => access.can(MANAGE_PERMISSION))
const tab = ref<'personal' | 'workspace'>('personal')
const tabs = computed<TabsItem[]>(() => [
  { label: t('appearance.personal'), value: 'personal', icon: 'i-lucide-user', slot: 'personal' as const },
  ...(canManage.value
    ? [
        {
          label: t('appearance.workspace'),
          value: 'workspace',
          icon: 'i-lucide-building-2',
          badge: { label: t('appearance.admin'), color: 'warning' as const, variant: 'subtle' as const },
          slot: 'workspace' as const,
        },
      ]
    : []),
])

const saving = ref(false)
async function saveWorkspace() {
  saving.value = true
  try {
    await theme.saveWorkspace()
    notify.success(t('appearance.workspaceSaved'))
  } catch (error) {
    notify.error(error)
  } finally {
    saving.value = false
  }
}
// Unsaved workspace changes are a preview: closing the panel drops them.
watch(open, (isOpen) => {
  if (isOpen) return
  theme.discardWorkspace()
  tab.value = 'personal'
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('appearance.title')"
    :description="tab === 'workspace' ? t('appearance.workspaceNote') : t('appearance.personalNote')"
  >
    <template #body>
      <UTabs v-model="tab" :items="tabs" :ui="{ list: 'mb-1', root: 'gap-0' }">
        <template #personal>
          <PlatformAppearanceControls scope="personal" />
        </template>
        <template #workspace>
          <PlatformAppearanceControls scope="workspace" />
        </template>
      </UTabs>
    </template>
    <template #footer>
      <template v-if="tab === 'workspace'">
        <UButton
          color="neutral"
          variant="ghost"
          class="me-auto"
          :disabled="!theme.workspaceDirty.value || saving"
          @click="theme.discardWorkspace()"
        >
          {{ t('appearance.discard') }}
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-save"
          :disabled="!theme.workspaceDirty.value"
          :loading="saving"
          @click="saveWorkspace"
        >
          {{ t('appearance.saveWorkspace') }}
        </UButton>
      </template>
      <UButton
        v-else
        color="neutral"
        variant="outline"
        icon="i-lucide-rotate-ccw"
        class="me-auto"
        @click="theme.resetToWorkspace()"
      >
        {{ t('appearance.reset') }}
      </UButton>
      <UButton @click="open = false">{{ t('platform.actions.done') }}</UButton>
    </template>
  </UModal>
</template>

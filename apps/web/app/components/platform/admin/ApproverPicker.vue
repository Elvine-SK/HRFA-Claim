<script setup lang="ts">
import type { ApproverSpec } from '../../../types/approval'
import type { UserAdmin } from '../../../types/platform'

const props = defineProps<{ resolvers: readonly string[]; disabled?: boolean }>()
const model = defineModel<ApproverSpec>({ required: true })
const { t } = useI18n()
const access = useAccess()

type Kind = 'role' | 'group' | 'user' | 'resolver'
const kind = computed<Kind>(() => (Object.keys(model.value)[0] as Kind | undefined) ?? 'role')
const value = computed(() => Object.values(model.value)[0] ?? '')
const kinds = computed(() =>
  (['role', 'group', 'user', 'resolver'] as const).map((k) => ({
    value: k,
    label: t(`admin.workflows.approver.${k}`),
  })),
)

const selectedUser = useApiItem<UserAdmin>(ADMIN_KEY, () =>
  kind.value === 'user' && value.value && access.can('user.read') ? `/users/${value.value}` : null,
)

const resolvers = computed(() => props.resolvers.map((r) => ({ value: r, label: r })))

function setKind(next: Kind) {
  if (next !== kind.value) model.value = { [next]: '' }
}
function setValue(next: string) {
  model.value = { [kind.value]: next }
}
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-[150px_1fr]">
    <USelect
      :model-value="kind"
      :items="kinds"
      :disabled="disabled"
      :aria-label="t('admin.workflows.approver.type')"
      @update:model-value="(v) => setKind(v as Kind)"
    />
    <PlatformUserPicker
      v-if="kind === 'user'"
      :model-value="value || undefined"
      :current="selectedUser.data.value"
      :disabled="disabled || !access.can('user.read')"
      :placeholder="t('admin.workflows.approver.pickUser')"
      @update:model-value="(v) => v && setValue(v)"
    />
    <PlatformAdminRoleGroupPicker
      v-else-if="kind === 'role' || kind === 'group'"
      :key="kind"
      :kind="kind"
      by="key"
      :model-value="value || undefined"
      :disabled="disabled || !access.can(`${kind}.read`)"
      :placeholder="t(`admin.workflows.approver.pick_${kind}`)"
      @update:model-value="(v) => typeof v === 'string' && setValue(v)"
    />
    <USelectMenu
      v-else
      :model-value="value"
      :items="resolvers"
      value-key="value"
      :disabled="disabled"
      :placeholder="t(`admin.workflows.approver.pick_${kind}`)"
      class="w-full"
      @update:model-value="(v: string) => setValue(v)"
    />
  </div>
</template>

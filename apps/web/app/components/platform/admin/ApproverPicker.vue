<script setup lang="ts">
import type { ApproverSpec } from '../../../types/approval'
import type { UserAdmin } from '../../../types/platform'

const props = defineProps<{
  resolvers: readonly string[]
  /** Entity fields of type string: the facts that can name a unit or a person. */
  stringFields?: readonly string[]
  disabled?: boolean
}>()
const model = defineModel<ApproverSpec>({ required: true })
const { t } = useI18n()
const access = useAccess()
const manifest = useManifest()

type Kind = 'role' | 'group' | 'user' | 'resolver' | 'unitRole' | 'supervisor'
type SimpleKind = 'role' | 'group' | 'user' | 'resolver'
const kind = computed<Kind>(() => (Object.keys(model.value)[0] as Kind | undefined) ?? 'role')
const value = computed(() => {
  const v = Object.values(model.value)[0]
  return typeof v === 'string' ? v : ''
})
const ORG_KINDS: readonly Kind[] = ['unitRole', 'supervisor']
const kinds = computed(() =>
  // The organisation kinds exist only where the org module is installed (or a saved step already uses one).
  (['role', 'group', 'user', 'resolver', 'unitRole', 'supervisor'] as const)
    .filter((k) => !ORG_KINDS.includes(k) || manifest.has('org') || kind.value === k)
    .map((k) => ({ value: k, label: t(`admin.workflows.approver.${k}`) })),
)

const facts = computed(() => (props.stringFields ?? []).map((f) => ({ value: f, label: f })))
const levels = computed(() =>
  [1, 2, 3, 4, 5].map((n) => ({ value: n, label: t('admin.workflows.approver.level', n) })),
)
const unitRole = computed(() => model.value.unitRole ?? { role: '', unitFact: '' })
const supervisor = computed(() => model.value.supervisor ?? { personFact: '', level: 1 })

const selectedUser = useApiItem<UserAdmin>(ADMIN_KEY, () =>
  kind.value === 'user' && value.value && access.can('user.read') ? `/users/${value.value}` : null,
)

const resolvers = computed(() => props.resolvers.map((r) => ({ value: r, label: r })))

function setKind(next: Kind) {
  if (next === kind.value) return
  if (next === 'unitRole') model.value = { unitRole: { role: '', unitFact: '' } }
  else if (next === 'supervisor') model.value = { supervisor: { personFact: '', level: 1 } }
  else model.value = { [next]: '' }
}
function setValue(next: string) {
  model.value = { [kind.value as SimpleKind]: next }
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
    <div v-if="kind === 'unitRole'" class="grid gap-2 sm:grid-cols-2">
      <PlatformAdminRoleGroupPicker
        kind="role"
        by="key"
        :model-value="unitRole.role || undefined"
        :disabled="disabled || !access.can('role.read')"
        :placeholder="t('admin.workflows.approver.pick_role')"
        @update:model-value="(v) => typeof v === 'string' && (model = { unitRole: { ...unitRole, role: v } })"
      />
      <USelect
        :model-value="unitRole.unitFact || undefined"
        :items="facts"
        :disabled="disabled"
        :placeholder="t('admin.workflows.approver.pick_unitFact')"
        :aria-label="t('admin.workflows.approver.unitFact')"
        class="w-full"
        @update:model-value="(v) => (model = { unitRole: { ...unitRole, unitFact: String(v) } })"
      />
    </div>
    <div v-else-if="kind === 'supervisor'" class="grid gap-2 sm:grid-cols-2">
      <USelect
        :model-value="supervisor.personFact || undefined"
        :items="facts"
        :disabled="disabled"
        :placeholder="t('admin.workflows.approver.pick_personFact')"
        :aria-label="t('admin.workflows.approver.personFact')"
        class="w-full"
        @update:model-value="(v) => (model = { supervisor: { ...supervisor, personFact: String(v) } })"
      />
      <USelect
        :model-value="supervisor.level"
        :items="levels"
        :disabled="disabled"
        :aria-label="t('admin.workflows.approver.levelLabel')"
        class="w-full"
        @update:model-value="(v) => (model = { supervisor: { ...supervisor, level: Number(v) } })"
      />
    </div>
    <PlatformUserPicker
      v-else-if="kind === 'user'"
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

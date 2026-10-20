<script setup lang="ts">
import type { BuilderGroup } from '@elvine-sk/platform-nuxt/utils'
import type { AuthzCatalog, Policy, RoleDetail } from '../../../types/platform'

const props = defineProps<{
  catalog: AuthzCatalog
  roles: RoleDetail[]
  policy?: Policy | null
  /** The role an existing policy belongs to, or the role a new one starts with. */
  role?: RoleDetail | null
  busy?: boolean
  error?: string | null
}>()
const emit = defineEmits<{
  /** A new policy is created once per role; an existing one stays with its role. */
  save: [body: Omit<Policy, 'id' | 'version'>, roleIds: string[]]
  remove: []
  cancel: []
}>()
const { t, te } = useI18n()
const access = useAccess()
const sentence = usePolicySentence()

const label = (text: string) => (te(text) ? t(text) : text)
const name = ref(props.policy?.name ?? '')
const effect = ref<'allow' | 'deny'>(props.policy?.effect ?? 'allow')
const resource = ref(props.policy?.resource ?? props.catalog.resources[0]?.resource ?? '')
const actions = ref<string[]>([...(props.policy?.actions ?? [])])
const roleIds = ref<string[]>(props.role ? [props.role.id] : [])
const tree = ref<BuilderGroup>(toBuilder(props.policy?.condition ?? null))
const showJson = ref(false)
const submitted = ref(false)

const resourceDef = computed(() => props.catalog.resources.find((r) => r.resource === resource.value))
const fields = computed(() => resourceDef.value?.fields ?? {})
const condition = computed(() => fromBuilder(tree.value))
const incomplete = computed(() => incompleteLeaves(tree.value).length)
const roleItems = computed(() =>
  props.roles.filter((r) => !r.isSuper).map((r) => ({ value: r.id, label: r.name })),
)
const roleNames = computed(() =>
  roleIds.value.map((id) => props.roles.find((r) => r.id === id)?.name).filter((n): n is string => !!n),
)
const errors = computed(() => ({
  name: submitted.value && !name.value.trim() ? t('admin.roles.policy.nameRequired') : undefined,
  actions: submitted.value && !actions.value.length ? t('admin.roles.policy.actionsRequired') : undefined,
  roles: submitted.value && !roleIds.value.length ? t('admin.roles.policy.rolesRequired') : undefined,
  condition:
    submitted.value && incomplete.value
      ? t('admin.roles.policy.incomplete', { n: incomplete.value }, incomplete.value)
      : undefined,
}))

const presets = computed(() => selfPresets(fields.value))
function applyPreset(field: string) {
  tree.value = { ...tree.value, items: [...tree.value.items, selfLeaf(field)] }
}
const plain = computed(() =>
  sentence(
    { effect: effect.value, resource: resource.value, actions: actions.value, condition: condition.value },
    roleNames.value,
    props.catalog,
  ),
)
// What the test panel tries; `null` until the policy could be saved (the name aside).
const draft = computed(() =>
  !actions.value.length || !roleIds.value.length || incomplete.value
    ? null
    : {
        id: props.policy?.id,
        name: name.value.trim() || undefined,
        roleIds: roleIds.value,
        effect: effect.value,
        actions: actions.value,
        condition: condition.value,
      },
)

watch(resource, (next, prev) => {
  if (prev === undefined || next === prev) return
  actions.value = actions.value.filter((a) => resourceDef.value?.actions.includes(a))
  tree.value = emptyGroup()
})

function save() {
  submitted.value = true
  if (errors.value.name || errors.value.actions || errors.value.roles || errors.value.condition) return
  emit(
    'save',
    {
      name: name.value.trim(),
      effect: effect.value,
      resource: resource.value,
      actions: actions.value,
      condition: condition.value,
    },
    roleIds.value,
  )
}
</script>

<template>
  <form class="grid gap-5" novalidate @submit.prevent="save">
    <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
    <UFormField :label="t('admin.roles.policy.name')" :error="errors.name" required>
      <UInput
        v-model="name"
        class="w-full"
        autofocus
        :placeholder="t('admin.roles.policy.namePlaceholder')"
      />
    </UFormField>
    <UFormField
      :label="t('admin.roles.policy.effect')"
      :help="effect === 'allow' ? t('admin.roles.policy.allowHelp') : t('admin.roles.policy.denyHelp')"
    >
      <PlatformSegmented
        v-model="effect"
        :options="[
          { value: 'allow', label: t('admin.roles.policy.allow'), icon: 'i-lucide-check' },
          { value: 'deny', label: t('admin.roles.policy.deny'), icon: 'i-lucide-ban' },
        ]"
        :label="t('admin.roles.policy.effect')"
      />
    </UFormField>
    <UFormField :label="t('admin.roles.policy.resource')">
      <USelect
        v-model="resource"
        :items="
          catalog.resources.map((r) => ({
            value: r.resource,
            label: label(r.label ?? r.resource),
            description: r.resource,
          }))
        "
        class="w-full"
      />
    </UFormField>
    <UFormField :label="t('admin.roles.policy.actions')" :error="errors.actions" required>
      <UCheckboxGroup
        v-model="actions"
        orientation="horizontal"
        :items="(resourceDef?.actions ?? []).map((a) => ({ value: a, label: a }))"
        :ui="{ fieldset: 'flex-wrap gap-x-5 gap-y-2', label: 'font-mono text-[12.5px]' }"
      />
    </UFormField>
    <UFormField
      :label="t('admin.roles.policy.roles')"
      :help="policy ? t('admin.roles.policy.roleFixed') : t('admin.roles.policy.rolesHint')"
      :error="errors.roles"
      :required="!policy"
    >
      <UBadge v-if="policy" color="neutral" variant="outline" icon="i-lucide-shield-check">
        {{ role?.name }}
      </UBadge>
      <USelectMenu
        v-else
        v-model="roleIds"
        :items="roleItems"
        value-key="value"
        multiple
        icon="i-lucide-shield-check"
        class="w-full"
        :placeholder="t('admin.roles.policy.rolesPlaceholder')"
      />
    </UFormField>
    <UFormField
      :label="t('admin.roles.policy.condition')"
      :description="condition ? t('admin.roles.policy.conditionHint') : t('admin.roles.policy.noCondition')"
      :error="errors.condition"
    >
      <div v-if="presets.length" class="mb-2 flex flex-wrap gap-2">
        <UButton
          v-for="field in presets"
          :key="field"
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-lucide-user"
          @click="applyPreset(field)"
        >
          {{ t('admin.roles.policy.presetSelf', { field }) }}
        </UButton>
      </div>
      <div class="cond-box">
        <PlatformAdminConditionBuilder v-model="tree" :fields="fields" />
      </div>
    </UFormField>
    <div class="plain" data-testid="policy-plain">
      <small>{{ t('admin.roles.policy.plain') }}</small>
      <p>{{ plain }}</p>
    </div>
    <div>
      <UButton
        size="xs"
        color="neutral"
        variant="link"
        :icon="showJson ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="px-0"
        @click="showJson = !showJson"
      >
        {{ t('admin.roles.policy.json') }}
      </UButton>
      <pre v-if="showJson" class="json mono">{{ JSON.stringify(condition, null, 2) ?? 'null' }}</pre>
    </div>
    <PlatformAdminPolicyTest
      v-if="resourceDef && access.can('user.read')"
      :resource="resourceDef"
      :draft="draft"
    />
    <div class="flex justify-end gap-2 border-t border-[var(--app-border)] pt-4">
      <UButton
        v-if="policy"
        color="error"
        variant="ghost"
        icon="i-lucide-trash-2"
        class="me-auto"
        :disabled="busy"
        @click="emit('remove')"
      >
        {{ t('platform.actions.delete') }}
      </UButton>
      <UButton color="neutral" variant="ghost" :disabled="busy" @click="emit('cancel')">{{
        t('platform.actions.cancel')
      }}</UButton>
      <UButton type="submit" :loading="busy" icon="i-lucide-check">{{ t('platform.actions.save') }}</UButton>
    </div>
  </form>
</template>

<style scoped>
.cond-box {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
}
.plain {
  padding: 10px 14px;
  border-inline-start: 3px solid var(--app-accent);
  border-radius: var(--app-r-sm);
  background: color-mix(in oklab, var(--app-accent) 7%, transparent);
}
.plain small {
  display: block;
  margin-bottom: 2px;
  color: var(--app-muted);
  font-size: 11.5px;
}
.plain p {
  font-size: 13.5px;
}
.json {
  max-height: 220px;
  overflow: auto;
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: var(--app-r-sm);
  background: var(--app-surface-2);
  font-size: 12px;
}
</style>

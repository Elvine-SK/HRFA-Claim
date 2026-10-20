<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'
import type { AccessExplanation, ResourceDef } from '../../../types/platform'

const props = defineProps<{
  resource: ResourceDef
  /** The policy as it is being edited; `null` while it can't be saved yet. */
  draft: {
    id?: string
    name?: string
    roleIds: string[]
    effect: 'allow' | 'deny'
    actions: string[]
    condition?: unknown
  } | null
}>()
const { t } = useI18n()
const api = useApi()
const notify = useNotify()

// Stands in for "a user other than the one being tested" in uuid fields.
const SOMEONE_ELSE = '00000000-0000-4000-8000-000000000000'

const userId = ref<string>()
const userName = ref('')

const actions = computed(() => (props.draft?.actions.length ? props.draft.actions : props.resource.actions))
const pickedAction = ref<string>()
const action = computed(() =>
  pickedAction.value && actions.value.includes(pickedAction.value) ? pickedAction.value : actions.value[0],
)

const values = reactive<Record<string, string>>({})
const fieldList = computed(() => Object.entries(props.resource.fields).map(([name, f]) => ({ name, ...f })))
const unset = computed(() => ({ value: 'unset', label: t('admin.roles.test.unset') }))
function choices(field: { type: string; values?: string[] }) {
  if (field.type === 'uuid')
    return [
      unset.value,
      { value: 'self', label: t('admin.roles.test.self') },
      { value: 'other', label: t('admin.roles.test.other') },
    ]
  if (field.type === 'boolean')
    return [
      unset.value,
      { value: 'true', label: t('admin.condition.true') },
      { value: 'false', label: t('admin.condition.false') },
    ]
  if (field.type === 'enum')
    return [unset.value, ...(field.values ?? []).map((v) => ({ value: v, label: v }))]
  return null
}
const inputType = (type: string) =>
  type === 'number' || type === 'decimal'
    ? 'number'
    : type === 'date'
      ? 'date'
      : type === 'datetime'
        ? 'datetime-local'
        : 'text'
function record() {
  const out: Record<string, string | number | boolean | null> = {}
  for (const field of fieldList.value) {
    const raw = values[field.name] ?? ''
    if (raw === '' || raw === 'unset') continue
    if (field.type === 'uuid') out[field.name] = raw === 'self' ? userId.value! : SOMEONE_ELSE
    else out[field.name] = parseInput(field, raw)
  }
  return out
}

const result = ref<AccessExplanation>()
const busy = ref(false)
watch([() => props.draft, userId, action, values], () => (result.value = undefined), { deep: true })
async function run() {
  if (!userId.value || !props.draft || !action.value) return
  busy.value = true
  try {
    const { data } = await api<DataResponse<AccessExplanation>>('/authz/explain', {
      method: 'POST',
      body: {
        userId: userId.value,
        resource: props.resource.resource,
        action: action.value,
        record: record(),
        policy: { ...props.draft, condition: props.draft.condition ?? undefined },
      },
    })
    result.value = data
  } catch (error) {
    notify.error(error)
  } finally {
    busy.value = false
  }
}
function stepText(step: AccessExplanation['steps'][number]) {
  const text = t(`admin.roles.test.step.${step.kind}_${step.outcome}`, {
    role: step.role,
    policy: step.draft ? t('admin.roles.test.thisPolicy') : step.policy,
    key: `${props.resource.resource}.${action.value}`,
  })
  return step.match === null ? `${text} ${t('admin.roles.test.unknown')}` : text
}
</script>

<template>
  <section class="pt" data-testid="policy-test">
    <h4><UIcon name="i-lucide-flask-conical" class="size-4" />{{ t('admin.roles.test.title') }}</h4>
    <p class="pt-hint">{{ t('admin.roles.test.hint') }}</p>
    <div class="grid gap-3 sm:grid-cols-[1fr_160px]">
      <UFormField :label="t('admin.roles.test.user')">
        <PlatformUserPicker
          v-model="userId"
          :placeholder="t('admin.roles.test.pickUser')"
          @pick="(user) => (userName = user.displayName)"
        />
      </UFormField>
      <UFormField :label="t('admin.roles.test.action')">
        <USelect
          :model-value="action"
          :items="actions"
          class="w-full"
          :ui="{ base: 'font-mono' }"
          @update:model-value="(v) => (pickedAction = v as string)"
        />
      </UFormField>
    </div>
    <fieldset v-if="fieldList.length" class="pt-rec">
      <legend>{{ t('admin.roles.test.record') }}</legend>
      <p class="pt-hint">{{ t('admin.roles.test.recordHint') }}</p>
      <div class="grid gap-x-3 gap-y-2 sm:grid-cols-2">
        <UFormField v-for="field in fieldList" :key="field.name" :label="field.name" size="sm">
          <USelect
            v-if="choices(field)"
            :model-value="values[field.name] ?? 'unset'"
            :items="choices(field)!"
            size="sm"
            class="w-full"
            @update:model-value="(v) => (values[field.name] = v as string)"
          />
          <UInput
            v-else
            :model-value="values[field.name] ?? ''"
            :type="inputType(field.type)"
            size="sm"
            class="w-full"
            :placeholder="t('admin.roles.test.unset')"
            @update:model-value="(v) => (values[field.name] = String(v))"
          />
        </UFormField>
      </div>
    </fieldset>
    <div class="flex items-center gap-3">
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-play"
        :loading="busy"
        :disabled="!userId || !draft"
        @click="run"
      >
        {{ t('admin.roles.test.run') }}
      </UButton>
      <span v-if="!draft" class="pt-hint">{{ t('admin.roles.test.finish') }}</span>
    </div>
    <div v-if="result" class="pt-out" :class="result.allowed ? 'ok' : 'bad'" role="status">
      <UIcon :name="result.allowed ? 'i-lucide-check' : 'i-lucide-x'" class="pt-big" />
      <div>
        <b>{{
          t(result.allowed ? 'admin.roles.test.yes' : 'admin.roles.test.no', { user: userName, action })
        }}</b>
        <p v-for="(step, i) in result.steps" :key="i" :class="step.outcome">{{ stepText(step) }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pt {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: color-mix(in oklab, var(--app-surface-2) 60%, transparent);
}
.pt h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 600;
}
.pt-hint {
  color: var(--app-muted);
  font-size: 12px;
}
.pt-rec {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}
.pt-rec legend {
  padding: 0;
  font-size: 12.5px;
  font-weight: 600;
}
.pt-out {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in oklab, var(--k) 35%, var(--app-border));
  border-radius: var(--app-r-md);
  background: color-mix(in oklab, var(--k) 8%, transparent);
  font-size: 13px;
}
.pt-out.ok {
  --k: var(--app-ok);
}
.pt-out.bad {
  --k: var(--app-bad);
}
.pt-big {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  color: var(--k);
}
.pt-out p {
  margin-top: 4px;
  font-size: 12.5px;
}
.pt-out p.skipped {
  color: var(--app-muted);
}
</style>

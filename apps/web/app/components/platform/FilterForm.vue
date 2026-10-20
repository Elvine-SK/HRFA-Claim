<script setup lang="ts">
/** Field → condition → value for one filter; emits the finished filter. */
import type { FilterOp } from '@elvine-sk/platform-core'
import {
  dayToInstants,
  fromFilterValue,
  inputKind,
  instantToDay,
  isComplete,
  toFilterValue,
  uiOps,
  type ListField,
  type ViewFilter,
} from '@elvine-sk/platform-nuxt/utils'
import type { UserAdmin } from '../../types/platform'

const props = defineProps<{
  fields: Record<string, ListField>
  /** Field names on offer, in order. */
  names: string[]
  labels: Record<string, string>
  valueLabels?: Record<string, Record<string, string>>
  userFields?: string[]
  /** The filter being edited; its field and condition are fixed. */
  editing?: ViewFilter | null
}>()
const emit = defineEmits<{ apply: [filter: ViewFilter] }>()
const { t } = useI18n()

const field = ref(props.editing?.field ?? props.names[0] ?? '')
const spec = computed(() => props.fields[field.value])
const ops = computed(() => (spec.value ? uiOps(spec.value) : []))
const op = ref<FilterOp>(props.editing?.op ?? ops.value[0] ?? 'eq')
const input = computed(() =>
  spec.value
    ? inputKind(spec.value, op.value, props.userFields?.includes(field.value))
    : { kind: 'text' as const, arity: 'one' as const },
)

// A date-time field is filtered by whole days: the form edits days, the filter holds the instants.
const isDatetime = computed(() => spec.value?.type === 'datetime')
const initial = props.editing
  ? fromFilterValue(props.editing.value).map((v) => (isDatetime.value ? instantToDay(v) : v))
  : []
const one = ref(initial[0] ?? '')
// The person being edited may not be on the picker's first page; load them so the picker can name them.
const access = useAccess()
const editedUser = useApiItem<UserAdmin>(ADMIN_KEY, () =>
  input.value.kind === 'user' && initial[0] && access.can('user.read') ? `/users/${initial[0]}` : null,
)
const two = ref(initial[1] ?? '')
const many = ref<string[]>(input.value.arity === 'many' ? initial : [])
const flag = ref(props.editing ? initial[0] === 'true' : true)

watch(field, () => {
  if (!ops.value.includes(op.value)) op.value = ops.value[0] ?? 'eq'
})
watch([field, () => input.value.kind, () => input.value.arity], () => {
  one.value = ''
  two.value = ''
  many.value = []
  flag.value = true
})

const values = computed<unknown[]>(() =>
  input.value.kind === 'boolean'
    ? [flag.value]
    : input.value.arity === 'many'
      ? many.value
      : input.value.arity === 'two'
        ? [one.value, two.value]
        : [one.value],
)
const ready = computed(() => !!spec.value && isComplete(input.value.kind, input.value.arity, values.value))

const opLabel = (o: FilterOp) => {
  const dates = spec.value?.type === 'date' || spec.value?.type === 'datetime'
  const group = dates && ['gt', 'gte', 'lt', 'lte'].includes(o) ? 'dateOps' : 'ops'
  return t(['lists', group, o].join('.'))
}
const fieldItems = computed(() =>
  props.names.map((name) => ({ label: props.labels[name] ?? name, value: name })),
)
const opItems = computed(() => ops.value.map((o) => ({ label: opLabel(o), value: o })))
const enumItems = computed(() =>
  (spec.value?.values ?? []).map((v) => ({ label: props.valueLabels?.[field.value]?.[v] ?? v, value: v })),
)
const type = computed(() =>
  input.value.kind === 'number' ? 'number' : input.value.kind === 'date' ? 'date' : 'text',
)

function submit() {
  if (!ready.value) return
  emit('apply', {
    field: field.value,
    op: op.value,
    value:
      isDatetime.value && input.value.kind === 'date'
        ? dayToInstants(op.value, [one.value, two.value])
        : toFilterValue(input.value.kind, input.value.arity, values.value),
  })
}
</script>

<template>
  <form class="filter-form" data-testid="filter-form" @submit.prevent="submit">
    <p class="eyebrow">{{ t('lists.filter.where') }}</p>
    <UFormField :label="t('lists.filter.field')">
      <USelect v-model="field" :items="fieldItems" :disabled="!!editing" class="w-full" />
    </UFormField>
    <UFormField :label="t('lists.filter.operator')">
      <USelect v-model="op" :items="opItems" :disabled="!!editing" class="w-full" />
    </UFormField>

    <div v-if="input.kind === 'boolean'" class="flex items-center gap-2">
      <USwitch v-model="flag" :label="flag ? t('lists.filter.yes') : t('lists.filter.no')" />
    </div>
    <UFormField v-else-if="input.kind === 'enum' && input.arity === 'many'" :label="t('lists.filter.value')">
      <USelectMenu v-model="many" :items="enumItems" value-key="value" multiple class="w-full" />
    </UFormField>
    <UFormField v-else-if="input.kind === 'enum'" :label="t('lists.filter.value')">
      <USelect v-model="one" :items="enumItems" class="w-full" />
    </UFormField>
    <UFormField v-else-if="input.kind === 'user'" :label="t('lists.filter.value')">
      <PlatformUserPicker
        :model-value="one || undefined"
        :current="editedUser.data.value"
        class="w-full"
        @update:model-value="(id?: string) => (one = id ?? '')"
      />
    </UFormField>
    <div v-else-if="input.arity === 'two'" class="grid grid-cols-2 gap-2">
      <UFormField :label="t('lists.filter.from')">
        <UInput v-model="one" :type="type" class="w-full" />
      </UFormField>
      <UFormField :label="t('lists.filter.to')">
        <UInput v-model="two" :type="type" class="w-full" />
      </UFormField>
    </div>
    <UFormField v-else :label="t('lists.filter.value')">
      <UInput v-model="one" :type="type" maxlength="200" class="w-full" />
    </UFormField>

    <UButton type="submit" size="sm" :disabled="!ready" block>{{ t('lists.filter.apply') }}</UButton>
  </form>
</template>

<style scoped>
.filter-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>

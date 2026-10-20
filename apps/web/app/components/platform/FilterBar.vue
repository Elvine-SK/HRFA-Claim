<script setup lang="ts">
/** The filters of a list as chips, with a form to add or edit one (UI spec §5.3). */
import { useMediaQuery } from '@vueuse/core'
import type { Filter, FilterOp } from '@elvine-sk/platform-core'
import {
  filterableFields,
  fromFilterValue,
  inputKind,
  uiOps,
  type ListField,
  type ViewFilter,
} from '@elvine-sk/platform-nuxt/utils'

const MAX_FILTERS = 20

const props = defineProps<{
  list: ReturnType<typeof useListQuery>
  fields: Record<string, ListField>
  /** Field → label; a field without a label is not offered. */
  labels: Record<string, string>
  /** Field → value → label, for enums. */
  valueLabels?: Record<string, Record<string, string>>
  /** `uuid` fields that hold a user. */
  userFields?: string[]
  /** Fields another control owns (the status tabs' field). */
  hide?: string[]
}>()
const { t } = useI18n()
const { date } = useDates()
const isPhone = useMediaQuery('(max-width: 640px)')

const access = useAccess()
const names = computed(() =>
  filterableFields(props.fields, props.labels, props.hide, {
    fields: props.userFields,
    canPick: access.can('user.read'),
  }),
)
const chips = computed(() =>
  props.list.filters.value.filter((f) => !props.hide?.includes(f.field) && props.fields[f.field]),
)
const full = computed(() => props.list.filters.value.length >= MAX_FILTERS)
// A filter from a hand-edited link (an operator the bar doesn't offer, a field without a label) can only be removed.
const editable = (filter: Filter) =>
  names.value.includes(filter.field) && uiOps(props.fields[filter.field]!).includes(filter.op)
// Everything Clear all removes, including filters on fields the list doesn't know.
const clearable = computed(
  () => !!props.list.q.value || props.list.filters.value.some((f) => !props.hide?.includes(f.field)),
)

const open = ref(false)
const editing = ref<ViewFilter | null>(null)
const title = computed(() => (editing.value ? t('lists.filter.edit') : t('lists.filter.add')))
function add() {
  editing.value = null
  open.value = true
}
function edit(filter: Filter) {
  if (!editable(filter)) return
  editing.value = { field: filter.field, op: filter.op, value: fromFilterValue(filter.value) }
  open.value = true
}
async function apply(filter: ViewFilter) {
  open.value = false
  await props.list.setFilter(filter.field, filter.op, filter.value)
}
const remove = (filter: Filter) => props.list.setFilter(filter.field, filter.op, undefined)

async function clearAll() {
  const kept = props.list.filters.value.filter((f) => props.hide?.includes(f.field))
  await props.list.update({ filters: kept, q: undefined, page: 1 })
}

const opLabel = (field: string, op: FilterOp) => {
  const type = props.fields[field]?.type
  const dates = type === 'date' || type === 'datetime'
  const group = dates && ['gt', 'gte', 'lt', 'lte'].includes(op) ? 'dateOps' : 'ops'
  return t(['lists', group, op].join('.'))
}

/** The value as words; user ids are drawn by `FilterUserName`. */
function valueText(filter: Filter): string[] {
  const { kind } = inputKind(props.fields[filter.field]!, filter.op, props.userFields?.includes(filter.field))
  return fromFilterValue(filter.value).map((raw) => {
    if (kind === 'boolean') return raw === 'true' ? t('lists.filter.yes') : t('lists.filter.no')
    if (kind === 'enum') return props.valueLabels?.[filter.field]?.[raw] ?? raw
    if (kind === 'date') return date(raw)
    return raw
  })
}
const isUser = (filter: Filter) => !!props.userFields?.includes(filter.field) && filter.op !== 'isNull'
const joiner = (filter: Filter) => (filter.op === 'between' ? ` ${t('lists.filter.and')} ` : ', ')
// "is empty: Yes" reads as plain "is empty".
const showValue = (filter: Filter) => filter.op !== 'isNull' || String(filter.value) === 'false'
const chipLabel = (filter: Filter) =>
  [
    props.labels[filter.field] ?? filter.field,
    opLabel(filter.field, filter.op),
    valueText(filter).join(joiner(filter)),
  ].join(' ')
</script>

<template>
  <div v-if="names.length || clearable" class="fbar" data-testid="filter-bar">
    <span
      v-for="chip in chips"
      :key="`${chip.field}.${chip.op}`"
      class="fchip"
      :data-filter="`${chip.field}.${chip.op}`"
    >
      <button
        type="button"
        class="fchip-body"
        :aria-label="editable(chip) ? t('lists.filter.edit') : chipLabel(chip)"
        :disabled="!editable(chip)"
        @click="edit(chip)"
      >
        <b>{{ labels[chip.field] ?? chip.field }}</b>
        <em>{{ opLabel(chip.field, chip.op) }}</em>
        <template v-if="showValue(chip)">
          <template v-if="isUser(chip)">
            <PlatformFilterUserName v-for="id in fromFilterValue(chip.value)" :id="id" :key="id" />
          </template>
          <span v-else>{{ valueText(chip).join(joiner(chip)) }}</span>
        </template>
      </button>
      <button
        type="button"
        class="fchip-x"
        :aria-label="t('lists.filter.remove', { label: chipLabel(chip) })"
        @click="remove(chip)"
      >
        <UIcon name="i-lucide-x" />
      </button>
    </span>

    <UTooltip v-if="names.length" :text="t('lists.filter.limit', { n: MAX_FILTERS })" :disabled="!full">
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        icon="i-lucide-filter"
        :disabled="full"
        @click="add"
      >
        {{ t('lists.filter.add') }}
      </UButton>
    </UTooltip>
    <button v-if="clearable" type="button" class="fbar-link" @click="clearAll">
      {{ t('lists.filter.clearAll') }}
    </button>

    <UDrawer v-if="isPhone" v-model:open="open" :title="title">
      <template #body>
        <PlatformFilterForm
          v-if="open"
          :fields="fields"
          :names="names"
          :labels="labels"
          :value-labels="valueLabels"
          :user-fields="userFields"
          :editing="editing"
          @apply="apply"
        />
      </template>
    </UDrawer>
    <UModal v-else v-model:open="open" :title="title" :ui="{ content: 'max-w-[340px]' }">
      <template #body>
        <PlatformFilterForm
          v-if="open"
          :fields="fields"
          :names="names"
          :labels="labels"
          :value-labels="valueLabels"
          :user-fields="userFields"
          :editing="editing"
          @apply="apply"
        />
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.fbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.fchip {
  display: inline-flex;
  max-width: 100%;
  height: 30px;
  align-items: center;
  border: 1px solid color-mix(in oklab, var(--app-accent) 28%, transparent);
  border-radius: 999px;
  background: color-mix(in oklab, var(--app-accent) 10%, transparent);
  font-size: 12.5px;
}
.fchip-body {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  padding: 0 4px 0 12px;
  cursor: pointer;
}
.fchip-body:disabled {
  cursor: default;
}
.fchip-body > * {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fchip-body b {
  font-weight: 600;
}
.fchip-body em {
  color: var(--app-muted);
  font-style: normal;
}
.fchip-x {
  display: grid;
  width: 26px;
  height: 28px;
  flex: none;
  place-items: center;
  border-radius: 0 999px 999px 0;
  color: var(--app-muted);
  cursor: pointer;
}
.fchip-x:hover {
  color: var(--app-text);
}
.fbar-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--app-accent);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
</style>

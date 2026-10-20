<script setup lang="ts" generic="T extends object">
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import { useDebounceFn, useLocalStorage, useMediaQuery } from '@vueuse/core'
import { h, resolveComponent } from 'vue'

export interface DataTableColumn<Row> {
  key: string
  label: string
  sortable?: boolean
  align?: 'start' | 'end'
  /** Numbers and codes: mono, tabular. */
  mono?: boolean
  /** Can't be hidden from the Columns menu. */
  locked?: boolean
  hiddenByDefault?: boolean
  /** Title of the ≤640 px card. */
  primary?: boolean
  /** Shown as a secondary line on ≤640 px cards. */
  card?: boolean
  class?: string
  value?: (row: Row) => unknown
}

export interface DataTableStatusTab {
  label: string
  value: string | null
  count?: number | null
}

const props = withDefaults(
  defineProps<{
    id: string
    rows: T[]
    columns: DataTableColumn<T>[]
    total: number
    list: ReturnType<typeof useListQuery>
    /** First load: nothing to show yet. */
    loading?: boolean
    /** Any request in flight (including page changes with previous rows still visible). */
    fetching?: boolean
    error?: Error | null
    statusTabs?: DataTableStatusTab[]
    statusField?: string
    searchable?: boolean
    selectable?: boolean
    rowKey?: string
    /** Plural noun for empty and error texts, e.g. "notes". */
    entities?: string
    caption?: string
    /** A list declared by a module (`lists` in the manifest): turns on the filter bar and saved views. */
    listKey?: string
    /** Field → label for the filter bar; a field without a label is not offered. */
    filterLabels?: Record<string, string>
    /** Field → value → label, for enum filters. */
    filterValueLabels?: Record<string, Record<string, string>>
    /** `uuid` fields that hold a user. */
    filterUserFields?: string[]
    /** Fields the page filters with a control of its own: no chip, not offered. */
    filterHide?: string[]
    /** The query parameter of the open saved view, for a page that uses `view` itself. */
    viewParam?: string
  }>(),
  {
    loading: false,
    fetching: false,
    error: null,
    statusTabs: undefined,
    statusField: 'status',
    searchable: true,
    selectable: false,
    rowKey: 'id',
    entities: 'records',
    caption: undefined,
    listKey: undefined,
    filterLabels: undefined,
    filterValueLabels: undefined,
    filterUserFields: undefined,
    filterHide: undefined,
    viewParam: undefined,
  },
)
const listFields = useListFields(() => props.listKey)

const emit = defineEmits<{ select: [row: T]; retry: [] }>()

defineSlots<
  {
    [key: `cell-${string}`]: (props: { row: T; value: unknown; q: string }) => unknown
  } & {
    bulk?: (props: { ids: string[]; allMatching: boolean; clear: () => void }) => unknown
    empty?: () => unknown
    'toolbar-end'?: () => unknown
  }
>()

const { t } = useI18n()
const theme = useTheme()
const UCheckbox = resolveComponent('UCheckbox')
const UIcon = resolveComponent('UIcon')

const list = props.list
const isSmall = useMediaQuery('(max-width: 640px)')
const showSkeleton = useDelayedFlag(() => props.loading)

const density = useLocalStorage<'comfortable' | 'compact'>(
  `nelvine:dt:${props.id}:density`,
  theme.effective.value.density === 'compact' ? 'compact' : 'comfortable',
)
const visibility = useLocalStorage<Record<string, boolean>>(
  `nelvine:dt:${props.id}:columns`,
  Object.fromEntries(props.columns.filter((c) => c.hiddenByDefault).map((c) => [c.key, false])),
)

const rowId = (row: T) => String((row as Record<string, unknown>)[props.rowKey])
const valueOf = (row: T, col: DataTableColumn<T>) =>
  col.value ? col.value(row) : (row as Record<string, unknown>)[col.key]
const display = (value: unknown) =>
  value === null || value === undefined || value === ''
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value)

const search = ref(list.q.value)
watch(list.q, (q) => {
  if (q !== search.value.trim()) search.value = q
})
const pushSearch = useDebounceFn((q: string) => list.setSearch(q), 300)
watch(search, (q) => {
  if (q.trim() !== list.q.value) void pushSearch(q)
})

const searchInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('searchInput')
defineShortcuts({ '/': () => searchInput.value?.inputRef?.focus() })

const activeStatus = computed(() => {
  const value = list.filterValue(props.statusField, 'eq')
  return typeof value === 'string' ? value : null
})
function setStatus(value: string | null) {
  void list.setFilter(props.statusField, 'eq', value ?? undefined)
}

function toggleSort(key: string) {
  const current = list.sort.value[0]
  const dir = current?.field === key && current.dir === 'asc' ? 'desc' : 'asc'
  void list.setSort([{ field: key, dir }])
}
function sortIcon(key: string) {
  const current = list.sort.value[0]
  if (current?.field !== key) return 'i-lucide-chevrons-up-down'
  return current.dir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'
}

const rowSelection = ref<Record<string, boolean>>({})
const allMatching = ref(false)
const selectedIds = computed(() => Object.keys(rowSelection.value).filter((k) => rowSelection.value[k]))
function clearSelection() {
  rowSelection.value = {}
  allMatching.value = false
}
watch(
  () => list.params.value.toString(),
  () => clearSelection(),
)

const tableColumns = computed<TableColumn<T>[]>(() => {
  const cols: TableColumn<T>[] = props.columns.map((col) => ({
    id: col.key,
    accessorFn: (row: T) => valueOf(row, col),
    enableSorting: !!col.sortable,
    enableHiding: !col.locked,
    header: () =>
      col.sortable
        ? h('button', { type: 'button', class: 'dt-sort-btn', onClick: () => toggleSort(col.key) }, [
            col.label,
            h(UIcon, { name: sortIcon(col.key), class: 'dt-sort', 'aria-hidden': 'true' }),
          ])
        : col.label,
    meta: {
      class: {
        th: col.align === 'end' ? 'text-end' : '',
        td: [col.align === 'end' && 'text-end', col.mono && 'mono', col.class].filter(Boolean).join(' '),
      },
    },
  }))
  if (props.selectable) {
    cols.unshift({
      id: 'select',
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) =>
        h(UCheckbox, {
          modelValue: table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
          'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
            table.toggleAllPageRowsSelected(!!value),
          'aria-label': t('platform.list.selectPage'),
        }),
      cell: ({ row }) =>
        h(UCheckbox, {
          modelValue: row.getIsSelected(),
          'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
          'aria-label': t('platform.list.selectRow'),
        }),
      meta: { class: { th: 'w-11', td: 'w-11' } },
    })
  }
  return cols
})

const columnItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: t('platform.list.visibleColumns'), type: 'label' }],
  props.columns.map((col) => ({
    label: col.label,
    type: 'checkbox' as const,
    checked: visibility.value[col.key] !== false,
    disabled: col.locked,
    onUpdateChecked: (checked: boolean) => (visibility.value = { ...visibility.value, [col.key]: checked }),
    onSelect: (event: Event) => event.preventDefault(),
  })),
])

const densityOptions = computed(() => [
  {
    value: 'comfortable' as const,
    label: t('platform.list.comfortable'),
    icon: 'i-lucide-rows-3',
    iconOnly: true,
  },
  { value: 'compact' as const, label: t('platform.list.compact'), icon: 'i-lucide-rows-4', iconOnly: true },
])

const range = computed(() => pageRange(list.page.value, list.pageSize.value, props.total))
const visibleColumns = computed(() => props.columns.filter((c) => visibility.value[c.key] !== false))
const primaryColumn = computed(() => props.columns.find((c) => c.primary) ?? props.columns[0])
// Row buttons (a column keyed `actions`) sit at the end of a phone card, outside the card's own button.
const actionsColumn = computed(() => props.columns.find((c) => c.key === 'actions'))
const cardColumns = computed(() =>
  props.columns.filter((c) => c.card && c !== primaryColumn.value).slice(0, 4),
)
const isEmpty = computed(() => !props.loading && !props.error && props.rows.length === 0)

function onRowSelect(_event: Event, row: TableRow<T>) {
  emit('select', row.original)
}
function toggleCard(row: T, value: boolean | 'indeterminate') {
  rowSelection.value = { ...rowSelection.value, [rowId(row)]: !!value }
}
</script>

<template>
  <div
    class="dt"
    :style="{ '--dt-row-h': density === 'compact' ? '38px' : '58px' }"
    :data-density="density"
    :aria-busy="fetching || loading"
  >
    <PlatformViewTabs v-if="listKey && listFields" :list="list" :list-key="listKey" :param="viewParam" />
    <div class="dt-toolbar">
      <PlatformFilterBar
        v-if="listFields && filterLabels"
        :list="list"
        :fields="listFields"
        :labels="filterLabels"
        :value-labels="filterValueLabels"
        :user-fields="filterUserFields"
        :hide="[...(statusTabs?.length ? [statusField] : []), ...(filterHide ?? [])]"
      />
      <div v-if="statusTabs?.length" class="dt-tabs" role="group" :aria-label="statusField">
        <button
          v-for="tab in statusTabs"
          :key="tab.value ?? 'all'"
          type="button"
          :aria-pressed="activeStatus === tab.value"
          @click="setStatus(tab.value)"
        >
          {{ tab.label }}
          <span v-if="tab.count != null" class="mono">{{ tab.count }}</span>
        </button>
      </div>
      <div class="dt-controls">
        <UInput
          v-if="searchable"
          ref="searchInput"
          v-model="search"
          type="search"
          icon="i-lucide-search"
          size="sm"
          :placeholder="t('platform.list.search')"
          :aria-label="t('platform.list.search')"
          class="dt-search"
        >
          <template #trailing><UKbd value="/" /></template>
        </UInput>
        <div class="flex-1" />
        <slot name="toolbar-end" />
        <UDropdownMenu :items="columnItems" :content="{ align: 'end' }">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-columns-3"
            :label="t('platform.list.columns')"
          />
        </UDropdownMenu>
        <PlatformSegmented v-model="density" :options="densityOptions" :label="t('platform.list.density')" />
      </div>
    </div>

    <Transition name="floatbar">
      <div
        v-if="selectable && (selectedIds.length || allMatching)"
        class="floatbar dt-bulk"
        role="region"
        aria-live="polite"
      >
        <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <UIcon name="i-lucide-square-check" class="size-4 text-[var(--app-accent)]" />
          <b>
            {{
              allMatching
                ? t('platform.list.allSelected', { total })
                : t('platform.list.selected', { n: selectedIds.length })
            }}
          </b>
          <button
            v-if="!allMatching && total > selectedIds.length"
            type="button"
            class="dt-link"
            @click="allMatching = true"
          >
            {{ t('platform.list.selectAll', { total }) }}
          </button>
        </span>
        <div class="flex flex-wrap gap-2">
          <slot name="bulk" :ids="selectedIds" :all-matching="allMatching" :clear="clearSelection" />
          <UButton color="neutral" variant="ghost" @click="clearSelection">{{
            t('platform.actions.clear')
          }}</UButton>
        </div>
      </div>
    </Transition>

    <template v-if="isSmall && rows.length && !loading">
      <ul class="dt-cards">
        <li v-for="row in rows" :key="rowId(row)" class="dt-card">
          <UCheckbox
            v-if="selectable"
            :model-value="!!rowSelection[rowId(row)]"
            :aria-label="t('platform.list.selectRow')"
            @update:model-value="(v: boolean | 'indeterminate') => toggleCard(row, v)"
          />
          <button type="button" class="dt-card-main" @click="emit('select', row)">
            <b v-if="primaryColumn">
              <slot
                :name="`cell-${primaryColumn.key}`"
                :row="row"
                :value="valueOf(row, primaryColumn)"
                :q="list.q.value"
              >
                <PlatformHighlight :text="display(valueOf(row, primaryColumn))" :query="list.q.value" />
              </slot>
            </b>
            <dl>
              <div v-for="col in cardColumns" :key="col.key">
                <dt>{{ col.label }}</dt>
                <dd :class="{ mono: col.mono }">
                  <slot :name="`cell-${col.key}`" :row="row" :value="valueOf(row, col)" :q="list.q.value">
                    {{ display(valueOf(row, col)) }}
                  </slot>
                </dd>
              </div>
            </dl>
          </button>
          <div v-if="actionsColumn && $slots['cell-actions']" class="dt-card-actions">
            <slot name="cell-actions" :row="row" :value="undefined" :q="list.q.value" />
          </div>
        </li>
      </ul>
    </template>

    <UTable
      v-else
      v-model:row-selection="rowSelection"
      v-model:column-visibility="visibility"
      :data="loading || error ? [] : rows"
      :columns="tableColumns"
      :sorting="list.sorting.value"
      :sorting-options="{ manualSorting: true }"
      :get-row-id="rowId"
      :loading="fetching && !loading"
      loading-color="primary"
      loading-animation="carousel"
      :caption="caption"
      sticky
      :class="{ 'dt-empty': isEmpty || loading || !!error }"
      @select="onRowSelect"
    >
      <template v-for="col in visibleColumns" :key="col.key" #[`${col.key}-cell`]="{ row }">
        <slot
          :name="`cell-${col.key}`"
          :row="row.original"
          :value="valueOf(row.original, col)"
          :q="list.q.value"
        >
          <PlatformHighlight :text="display(valueOf(row.original, col))" :query="list.q.value" />
        </slot>
      </template>
      <template #empty>
        <div v-if="loading" class="dt-skel" :aria-label="t('platform.states.loading')">
          <template v-if="showSkeleton">
            <div v-for="n in 6" :key="n" class="dt-skel-row">
              <USkeleton class="h-3.5 w-[34%]" />
              <USkeleton class="h-3.5 w-[16%]" />
              <USkeleton class="h-3.5 w-[12%]" />
              <USkeleton class="ms-auto h-3.5 w-[14%]" />
            </div>
          </template>
        </div>
        <div v-else-if="error" class="dt-error" role="alert">
          <UIcon name="i-lucide-circle-alert" class="size-5 shrink-0 text-error" />
          <div class="min-w-0 flex-1 text-start">
            <p class="font-semibold">{{ t('platform.list.loadFailed', { entities }) }}</p>
            <p class="text-xs text-muted">
              {{ error.message }}
              <template v-if="isApiError(error) && error.requestId">
                · {{ t('platform.errors.requestId', { id: error.requestId }) }}
              </template>
            </p>
          </div>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-rotate-cw"
            @click="emit('retry')"
          >
            {{ t('platform.actions.retry') }}
          </UButton>
        </div>
        <PlatformEmptyState
          v-else-if="list.isFiltered.value"
          kind="no-results"
          :title="t('platform.list.noMatchTitle', { entities })"
          :text="t('platform.list.noMatchText')"
        >
          <template #actions>
            <UButton color="neutral" variant="outline" icon="i-lucide-x" @click="list.clearFilters()">
              {{ t('platform.actions.clearFilters') }}
            </UButton>
          </template>
        </PlatformEmptyState>
        <slot v-else name="empty">
          <PlatformEmptyState
            :title="t('platform.list.emptyTitle', { entities })"
            :text="t('platform.list.emptyText', { entities })"
          />
        </slot>
      </template>
    </UTable>

    <footer v-if="total > 0 || list.page.value > 1" class="dt-foot">
      <p class="text-[12.5px] text-muted">
        {{ t('platform.list.showing', { from: range.from, to: range.to, total }) }}
      </p>
      <div class="flex items-center gap-2 text-[12.5px] text-muted">
        <span class="max-sm:hidden">{{ t('platform.list.rowsPerPage') }}</span>
        <USelect
          :model-value="list.pageSize.value"
          :items="[...list.pageSizeOptions]"
          size="sm"
          class="w-[76px]"
          :aria-label="t('platform.list.rowsPerPage')"
          @update:model-value="(v) => list.setPageSize(Number(v))"
        />
      </div>
      <UPagination
        :page="list.page.value"
        :items-per-page="list.pageSize.value"
        :total="total"
        :sibling-count="1"
        size="sm"
        class="ms-auto"
        @update:page="(p: number) => list.setPage(p)"
      />
    </footer>
  </div>
</template>

<style scoped>
.dt {
  min-width: 0;
}
.dt-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px 12px;
}
.dt-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dt-tabs button {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 7px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: transparent;
  color: var(--app-muted);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--app-dur-base),
    color var(--app-dur-base);
}
.dt-tabs button:hover {
  background: var(--app-hover);
  color: var(--app-text);
}
.dt-tabs button span {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--app-surface-2);
  color: var(--app-muted);
  font-size: 11px;
}
.dt-tabs button[aria-pressed='true'] {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-surface);
}
.dt-tabs button[aria-pressed='true'] span {
  background: color-mix(in oklab, var(--app-surface) 20%, transparent);
  color: inherit;
}
.dt-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.dt-search {
  max-width: 380px;
  flex: 1 1 240px;
}
.dt-search :deep(input::-webkit-search-cancel-button) {
  display: none;
}
.dt-bulk {
  font-size: 13px;
}
/* Room under the footer, so the floating bar does not cover the pager at the end of the page. */
.dt:has(> .dt-bulk) {
  padding-bottom: 40px;
}
.dt-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--app-accent);
  font-weight: 600;
  cursor: pointer;
}
/* .dt :deep([data-slot='root']) {
  border-top: 1px solid var(--app-border);
} */
.dt :deep(.dt-sort-btn) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}
.dt :deep(.dt-sort-btn:hover),
.dt :deep(th[aria-sort='ascending']),
.dt :deep(th[aria-sort='descending']) {
  color: var(--app-text);
}
.dt :deep(.dt-sort) {
  width: 13px;
  height: 13px;
  opacity: 0.4;
}
.dt :deep(th[aria-sort$='ing'] .dt-sort) {
  color: var(--app-accent);
  opacity: 1;
}
.dt-skel {
  min-height: 120px;
}
.dt-skel-row {
  display: flex;
  height: var(--dt-row-h);
  align-items: center;
  gap: 24px;
  padding: 0 12px;
  border-bottom: 1px solid var(--app-border);
}
.dt-error {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px;
  padding: 12px 14px;
  border: 1px solid color-mix(in oklab, var(--app-bad) 30%, transparent);
  border-radius: var(--app-r-md);
  background: color-mix(in oklab, var(--app-bad) 7%, var(--app-surface));
  font-size: 13px;
}
.dt-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 12px 18px;
  border-top: 1px solid var(--app-border);
}
.dt-cards {
  display: grid;
  /* A track is as wide as its content by default: a long unbroken name would push every card off a phone. */
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin: 0;
  padding: 0 12px 12px;
  list-style: none;
}
.dt-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: var(--app-surface);
}
.dt-card-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: start;
  cursor: pointer;
}
.dt-card-actions {
  display: flex;
  flex: none;
  align-items: center;
  margin: -4px -6px -4px 0;
}
.dt-card-main > b {
  min-width: 0;
  max-width: 100%;
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.dt-card-main > b > :deep(*) {
  max-width: 100%;
}
.dt-card-main dl {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  font-size: 12.5px;
}
.dt-card-main dt {
  display: none;
}
.dt-card-main dd {
  margin: 0;
  color: var(--app-muted);
}
</style>

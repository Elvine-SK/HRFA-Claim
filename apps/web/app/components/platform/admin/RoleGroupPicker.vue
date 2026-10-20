<script setup lang="ts" generic="T extends string | string[] | undefined">
import type { ListResponse } from '@elvine-sk/platform-core'
import { useQuery } from '@tanstack/vue-query'
import { refDebounced, useInfiniteScroll } from '@vueuse/core'

interface PickerRow {
  id: string
  key: string
  name: string
}

/**
 * Picks roles or groups, one or several, from a list of any length: the server searches, pages load as the
 * list is scrolled and only the rows in view are rendered. Chosen ones outside the loaded pages are fetched
 * by their value so they keep their names.
 */
const props = defineProps<{
  kind: 'role' | 'group'
  /** What the model holds: the record's id or its key. */
  by: 'id' | 'key'
  multiple?: boolean
  placeholder?: string
  disabled?: boolean
}>()
const model = defineModel<T>()
const { t } = useI18n()
const api = useApi()
const access = useAccess()
const readable = computed(() => access.can(`${props.kind}.read`))

const path = computed(() => (props.kind === 'role' ? '/authz/roles' : '/authz/groups'))
const term = ref('')
const list = useInfiniteList<PickerRow>(ADMIN_KEY, path, {
  q: refDebounced(term, 250),
  pageSize: 30,
  sort: 'name',
  enabled: () => readable.value && !props.disabled,
})

const chosen = computed<string[]>(() => {
  const v = model.value
  return Array.isArray(v) ? v : v ? [v as string] : []
})
const valueOf = (row: PickerRow) => row[props.by]
const missing = computed(() => {
  const loaded = new Set(list.rows.value.map(valueOf))
  return chosen.value.filter((v) => !loaded.has(v)).sort()
})
const outside = useQuery({
  queryKey: computed(() => [ADMIN_KEY, path.value, 'by', props.by, missing.value]),
  enabled: () => readable.value && missing.value.length > 0,
  queryFn: async ({ signal }) => {
    const params = new URLSearchParams({
      [`filter[${props.by}][in]`]: missing.value.join(','),
      pageSize: '100',
    })
    return (await api<ListResponse<PickerRow>>(`${path.value}?${params}`, { signal })).data
  },
  placeholderData: (previous) => previous,
  staleTime: 60_000,
})

const items = computed(() => {
  const rows = list.rows.value
  const loaded = new Set(rows.map(valueOf))
  const extra = (outside.data.value ?? []).filter(
    (r) => chosen.value.includes(valueOf(r)) && !loaded.has(valueOf(r)),
  )
  return [...extra, ...rows].map((r) => ({ value: valueOf(r), label: r.name, description: r.key }))
})

const menu = useTemplateRef<{ viewportRef?: HTMLElement | null }>('menu')
useInfiniteScroll(
  () => menu.value?.viewportRef,
  () => list.loadMore(),
  { distance: 120, canLoadMore: () => list.hasNextPage.value },
)
</script>

<template>
  <USelectMenu
    ref="menu"
    v-model="model"
    v-model:search-term="term"
    :items="items"
    value-key="value"
    :multiple="multiple"
    ignore-filter
    virtualize
    :loading="list.isFetching.value"
    :disabled="disabled"
    :placeholder="placeholder"
    class="w-full"
  >
    <template v-if="list.total.value > list.rows.value.length" #content-bottom>
      <p class="border-t border-[var(--app-border)] px-3 py-1.5 text-[11.5px] text-[var(--app-muted)]">
        {{ t('admin.listShowing', { n: list.rows.value.length, total: list.total.value }) }}
      </p>
    </template>
  </USelectMenu>
</template>

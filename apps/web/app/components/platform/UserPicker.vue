<script setup lang="ts">
import { refDebounced, useInfiniteScroll } from '@vueuse/core'

interface PickerUser {
  id: string
  displayName: string
  email?: string | null
  username?: string | null
}

/**
 * Picks one user from a list that may hold thousands: the server searches, pages load as the list is
 * scrolled, and only the rows in view are rendered.
 */
const props = withDefaults(
  defineProps<{
    /** A paged endpoint of `{ id, displayName, email }` rows that takes `q`. */
    path?: string
    placeholder?: string
    icon?: string
    disabled?: boolean
    /** The chosen user, when it may not be among the loaded pages. */
    current?: PickerUser | null
    /** Forget the choice after each pick (adding members one after another). */
    resetOnPick?: boolean
  }>(),
  { path: '/users', icon: 'i-lucide-user' },
)
const model = defineModel<string | undefined>()
const emit = defineEmits<{ pick: [user: PickerUser] }>()
const { t } = useI18n()

const term = ref('')
const list = useInfiniteList<PickerUser>(ADMIN_KEY, () => props.path, {
  q: refDebounced(term, 250),
  pageSize: 30,
  sort: 'displayName',
})
const picked = ref<PickerUser | null>(null)
const items = computed(() => {
  const rows = [...list.rows.value]
  const chosen = [picked.value, props.current].find((u) => u && u.id === model.value)
  if (chosen && !rows.some((u) => u.id === chosen.id)) rows.unshift(chosen)
  return rows.map((u) => ({
    value: u.id,
    label: u.displayName,
    description: u.email ?? u.username ?? undefined,
  }))
})
function onPick(id: unknown) {
  if (typeof id !== 'string' || !id) return
  const user = list.rows.value.find((u) => u.id === id)
  if (user) {
    picked.value = user
    emit('pick', user)
  }
  if (!props.resetOnPick) model.value = id
  // The menu keeps its own selection when given none; a fresh one starts empty again.
  else resets.value++
}
const resets = ref(0)

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
    :key="resets"
    v-model:search-term="term"
    :model-value="resetOnPick ? undefined : model"
    :items="items"
    value-key="value"
    ignore-filter
    virtualize
    :loading="list.isFetching.value"
    :disabled="disabled"
    :placeholder="placeholder"
    :icon="icon"
    class="w-full"
    @update:model-value="onPick"
  >
    <template v-if="list.total.value > list.rows.value.length" #content-bottom>
      <p class="border-t border-[var(--app-border)] px-3 py-1.5 text-[11.5px] text-[var(--app-muted)]">
        {{ t('admin.listShowing', { n: list.rows.value.length, total: list.total.value }) }}
      </p>
    </template>
  </USelectMenu>
</template>

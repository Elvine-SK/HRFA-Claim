<script setup lang="ts">
import { refDebounced, useInfiniteScroll } from '@vueuse/core'
import type { GroupMember } from '../../../types/platform'

/**
 * A group's members: searched and paged by the server, loaded as the list is scrolled, drawn in view only.
 * Any record with the same `members` / `candidates` routes uses it through `base` (a workspace's members).
 */
const props = withDefaults(
  defineProps<{
    groupId?: string
    /** The record's path; `<base>/members` lists and changes members, `<base>/candidates` offers new ones. */
    base?: string
    total: number
    editable: boolean
    /** Whether the add picker shows; by default when the reader may look users up. */
    canPick?: boolean
  }>(),
  // An absent boolean prop would read as `false`; `undefined` keeps the default below.
  { groupId: undefined, base: undefined, canPick: undefined },
)
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const access = useAccess()
const notify = useNotify()
const action = useAdminAction()
const base = computed(() => props.base ?? `/authz/groups/${props.groupId}`)
const picker = computed(() => props.editable && (props.canPick ?? access.can('user.read')))

const term = ref('')
const q = refDebounced(term, 250)
const list = useInfiniteList<GroupMember>(ADMIN_KEY, () => `${base.value}/members`, {
  q,
  pageSize: 50,
  sort: 'displayName',
})

async function change(add: string[], remove: string[]) {
  try {
    await action.mutateAsync({ path: `${base.value}/members`, body: { add, remove } })
    emit('changed')
  } catch (error) {
    notify.error(error)
  }
}

const area = useTemplateRef<{ $el?: HTMLElement }>('area')
useInfiniteScroll(
  () => area.value?.$el,
  () => list.loadMore(),
  { distance: 200, canLoadMore: () => list.hasNextPage.value },
)
</script>

<template>
  <div class="grid gap-3" data-testid="group-members">
    <PlatformUserPicker
      v-if="picker"
      :path="`${base}/candidates`"
      reset-on-pick
      icon="i-lucide-user-plus"
      :placeholder="t('admin.groups.addMember')"
      @pick="(user) => change([user.id], [])"
    />
    <UInput
      v-if="total > 8 || term"
      v-model="term"
      icon="i-lucide-search"
      :placeholder="t('admin.groups.searchMembers')"
      :aria-label="t('admin.groups.searchMembers')"
      :loading="list.isFetching.value && !!term"
      class="w-full"
    />
    <UScrollArea
      v-if="list.rows.value.length"
      ref="area"
      v-slot="{ item }"
      :items="list.rows.value"
      :virtualize="{ estimateSize: 53, skipMeasurement: true }"
      class="max-h-[424px]"
    >
      <div class="mem">
        <PlatformUserAvatar :name="item.displayName" :seed="item.id" size="sm" />
        <div class="min-w-0 flex-1">
          <b class="block truncate text-[13.5px]">{{ item.displayName }}</b>
          <span class="block truncate text-[12px] text-[var(--app-muted)]">{{
            item.email ?? item.username
          }}</span>
        </div>
        <UButton
          v-if="editable"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          :aria-label="t('admin.groups.removeMember', { name: item.displayName })"
          @click="change([], [item.id])"
        />
      </div>
    </UScrollArea>
    <div v-else-if="list.isPending.value" class="grid gap-2">
      <USkeleton v-for="n in 4" :key="n" class="h-10 w-full" />
    </div>
    <p v-else class="muted text-[13px]">
      {{ q ? t('admin.groups.noMemberMatch') : t('admin.groups.noMembers') }}
    </p>
    <p v-if="list.total.value > list.rows.value.length" class="text-[12px] text-[var(--app-muted)]">
      {{ t('admin.listShowing', { n: list.rows.value.length, total: list.total.value }) }}
    </p>
  </div>
</template>

<style scoped>
.mem {
  display: flex;
  height: 53px;
  align-items: center;
  gap: 10px;
  padding-inline-end: 4px;
  border-bottom: 1px solid var(--app-border);
}
</style>

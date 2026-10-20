<script setup lang="ts">
import type { WidgetSize } from '@elvine-sk/platform-nuxt/utils'
import { useQueryClient } from '@tanstack/vue-query'
import type { InboxItem } from '../../../types/approval'
import type { Tone } from '../../../utils/tone'

defineProps<{ size: WidgetSize }>()
const { t } = useI18n()
const { relative, dayjs, date } = useDates()
const entities = useApprovalEntityRegistry()
const notify = useNotify()
const client = useQueryClient()
const params = ref(new URLSearchParams({ pageSize: '5' }))
const inbox = useApiList<InboxItem>(APPROVAL_KEY, '/approval/inbox', { params })
const { act } = useApprovalActions()

const busy = ref<string | null>(null)
const rejecting = ref<string | null>(null)
const comment = ref('')
// A reason belongs to one request: start empty whenever another reject form opens or this one closes.
watch(rejecting, () => (comment.value = ''))

/** Overdue in red, due today in amber, a later date in grey. */
function due(item: InboxItem): { label: string; tone: Tone } | null {
  if (!item.dueAt) return null
  const at = dayjs(item.dueAt)
  if (at.isBefore(dayjs())) {
    const days = Math.max(1, dayjs().diff(at, 'day'))
    return { label: t('dashboard.widgets.approvals.overdue', { n: days }), tone: 'danger' }
  }
  if (at.isSame(dayjs(), 'day')) return { label: t('dashboard.widgets.approvals.dueToday'), tone: 'warning' }
  return { label: t('dashboard.widgets.approvals.dueOn', { date: date(at, 'D MMM') }), tone: 'neutral' }
}

async function decide(item: InboxItem, action: 'approve' | 'reject') {
  busy.value = item.requestId
  try {
    await act.mutateAsync({
      id: item.requestId,
      action,
      comment: action === 'reject' ? comment.value : undefined,
    })
    // The numbers only: refetching the layout would undo an edit that hasn't been saved yet.
    void client.invalidateQueries({ queryKey: [DASHBOARD_KEY, '/dashboard/stats'] })
    notify.success(t(`dashboard.widgets.approvals.${action === 'approve' ? 'approved' : 'rejected'}`))
    rejecting.value = null
    comment.value = ''
  } catch (error) {
    notify.error(error)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <PlatformDashboardWidgetFrame
    :title="t('dashboard.widgets.approvals.title')"
    :subtitle="t('dashboard.widgets.approvals.subtitle')"
    icon="i-lucide-stamp"
    :loading="inbox.isPending.value"
    :error="inbox.error.value"
    @retry="inbox.refetch()"
  >
    <template #action>
      <NuxtLink to="/approvals" class="shrink-0 text-[12.5px] font-medium text-[var(--app-accent)]">
        {{ t('dashboard.widgets.approvals.viewAll', { n: inbox.data.value?.meta.total ?? 0 }) }}
      </NuxtLink>
    </template>
    <div v-if="!inbox.data.value?.data.length" class="flex flex-col items-center gap-2 py-4 text-center">
      <span
        class="grid size-10 place-items-center rounded-full bg-[color-mix(in_oklab,var(--app-ok)_13%,transparent)] text-[var(--app-ok)]"
      >
        <UIcon name="i-lucide-check" class="size-5" />
      </span>
      <b class="text-sm">{{ t('dashboard.widgets.approvals.caughtUp') }}</b>
      <p class="text-xs text-muted">{{ t('dashboard.widgets.approvals.empty') }}</p>
    </div>
    <ul v-else data-testid="approvals-widget">
      <li
        v-for="item in inbox.data.value.data"
        :key="item.assignmentId"
        class="row"
        :data-request="item.requestId"
      >
        <PlatformUserAvatar :name="item.submittedBy.displayName" :seed="item.submittedBy.id" size="sm" />
        <div class="min-w-0 flex-1">
          <b class="block truncate text-[13px] font-semibold">{{ item.submittedBy.displayName }}</b>
          <small class="block truncate text-xs text-muted">
            {{ entities.label(item.entityType) }} · {{ relative(item.submittedAt) }}
          </small>
        </div>
        <span v-if="due(item)" class="tag mono" :style="{ '--k': toneVar(due(item)!.tone) }">
          {{ due(item)!.label }}
        </span>
        <button
          type="button"
          class="ib ok"
          :aria-label="t('dashboard.widgets.approvals.approve')"
          :title="t('dashboard.widgets.approvals.approve')"
          :disabled="!!busy"
          @click="decide(item, 'approve')"
        >
          <UIcon
            :name="
              busy === item.requestId && rejecting !== item.requestId
                ? 'i-lucide-loader-circle'
                : 'i-lucide-check'
            "
            :class="{ 'animate-spin': busy === item.requestId && rejecting !== item.requestId }"
          />
        </button>
        <UPopover
          :open="rejecting === item.requestId"
          @update:open="(open: boolean) => (rejecting = open ? item.requestId : null)"
        >
          <button
            type="button"
            class="ib no"
            :aria-label="t('dashboard.widgets.approvals.reject')"
            :title="t('dashboard.widgets.approvals.reject')"
            :disabled="!!busy"
          >
            <UIcon name="i-lucide-x" />
          </button>
          <template #content>
            <form
              class="flex w-72 flex-col gap-2 p-3"
              data-testid="reject-form"
              @submit.prevent="decide(item, 'reject')"
            >
              <UTextarea
                v-model="comment"
                :aria-label="t('dashboard.widgets.approvals.comment')"
                :placeholder="t('dashboard.widgets.approvals.commentPlaceholder')"
                :rows="3"
                autofocus
              />
              <UButton
                type="submit"
                color="error"
                block
                :loading="busy === item.requestId"
                :disabled="!comment.trim()"
              >
                {{ t('dashboard.widgets.approvals.reject') }}
              </UButton>
            </form>
          </template>
        </UPopover>
        <NuxtLink
          :to="`/approvals?request=${item.requestId}`"
          class="ib"
          :aria-label="t('dashboard.widgets.approvals.open', { name: item.submittedBy.displayName })"
        >
          <UIcon name="i-lucide-chevron-right" />
        </NuxtLink>
      </li>
    </ul>
  </PlatformDashboardWidgetFrame>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--app-border);
}
.row:last-child {
  border-bottom: 0;
}
.tag {
  padding: 2px 8px;
  border-radius: 6px;
  background: color-mix(in oklab, var(--k) 13%, transparent);
  color: color-mix(in oklab, var(--k) 75%, var(--app-text));
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.ib {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-sm);
  background: var(--app-surface);
  color: var(--app-muted);
  font-size: 15px;
  cursor: pointer;
  transition:
    background-color var(--app-dur-base),
    color var(--app-dur-base),
    border-color var(--app-dur-base);
}
.ib:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text);
}
.ib.ok {
  color: var(--app-ok);
}
.ib.ok:hover:not(:disabled) {
  border-color: var(--app-ok);
  background: var(--app-ok);
  color: #fff;
}
.ib.no:hover:not(:disabled) {
  border-color: var(--app-bad);
  background: var(--app-bad);
  color: #fff;
}
.ib:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

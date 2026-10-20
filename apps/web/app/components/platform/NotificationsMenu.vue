<script setup lang="ts">
import type { Notification } from '../../types/notifications'

const { t } = useI18n()
const notify = useNotify()
const timezone = useTimezone()
const manifest = useManifest()

const open = ref(false)
const view = ref<'unread' | 'all'>('unread')
const count = useUnreadCount()
const list = useNotificationList(() => view.value === 'unread', open)
const markRead = useMarkRead()

const badge = computed(() => badgeCount(count.data.value))
const items = computed(() => list.data.value?.pages.flat() ?? [])
const groups = computed(() => groupByDay(items.value, timezone.value))
const bellLabel = computed(() =>
  count.data.value
    ? `${t('shell.notifications')}, ${t('notifications.menu.badge', { n: count.data.value })}`
    : t('shell.notifications'),
)

watch(open, (isOpen) => isOpen && count.refetch())

async function openItem(item: Notification) {
  open.value = false
  if (!item.readAt) markRead.mutate({ ids: [item.id] }, { onError: (error) => notify.error(error) })
  const to = safeRedirect(item.link, '')
  if (to) await navigateTo(to)
}

/** Approval request id to preview on hover, when the notification is about one. */
function peekOf(item: Notification) {
  return item.entity?.type === 'approval_request' && manifest.has('approval') ? item.entity.id : null
}

function markAll() {
  markRead.mutate({ all: true }, { onError: (error) => notify.error(error) })
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'end', sideOffset: 8 }"
    :ui="{ content: 'overflow-hidden' }"
  >
    <UTooltip :text="t('shell.notifications')">
      <UButton
        color="neutral"
        variant="ghost"
        square
        icon="i-lucide-bell"
        class="relative"
        :aria-label="bellLabel"
        data-testid="notifications-bell"
      >
        <span v-if="badge" class="nt-badge" aria-hidden="true">{{ badge }}</span>
      </UButton>
    </UTooltip>

    <template #content>
      <section class="nt" :aria-label="t('notifications.menu.title')" data-testid="notifications-menu">
        <header class="nt-h">
          <h2>{{ t('notifications.menu.title') }}</h2>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-check-check"
            :disabled="!count.data.value"
            :loading="markRead.isPending.value"
            @click="markAll"
          >
            {{ t('notifications.menu.markAllRead') }}
          </UButton>
        </header>
        <div class="nt-tabs">
          <PlatformSegmented
            v-model="view"
            block
            :label="t('notifications.menu.title')"
            :options="[
              { value: 'unread', label: t('notifications.menu.unread') },
              { value: 'all', label: t('notifications.menu.all') },
            ]"
          />
        </div>

        <div class="nt-body">
          <div v-if="list.isPending.value" class="space-y-2 p-3">
            <USkeleton v-for="n in 3" :key="n" class="h-12 w-full" />
          </div>
          <div v-else-if="list.isError.value" class="nt-error" role="alert">
            <span>{{ t('notifications.menu.error') }}</span>
            <UButton size="xs" color="neutral" variant="outline" @click="list.refetch()">
              {{ t('platform.actions.retry') }}
            </UButton>
          </div>
          <PlatformEmptyState
            v-else-if="!items.length"
            :kind="view === 'unread' ? 'all-done' : 'first-use'"
            :icon="view === 'unread' ? undefined : 'i-lucide-bell'"
            :title="
              view === 'unread' ? t('notifications.menu.emptyUnread') : t('notifications.menu.emptyAll')
            "
            :text="t('notifications.menu.emptyText')"
          />
          <template v-else>
            <div v-for="g in groups" :key="g.group" role="group" :aria-labelledby="`nt-g-${g.group}`">
              <h3 :id="`nt-g-${g.group}`" class="nt-g eyebrow">{{ t(`notifications.groups.${g.group}`) }}</h3>
              <ul>
                <li v-for="item in g.items" :key="item.id">
                  <UPopover
                    v-if="peekOf(item)"
                    mode="hover"
                    :open-delay="350"
                    :close-delay="100"
                    :content="{ side: 'left', align: 'start', sideOffset: 14 }"
                  >
                    <PlatformNotificationItem :item="item" @open="openItem" />
                    <template #content>
                      <PlatformNotificationPeek :request-id="peekOf(item)!" />
                    </template>
                  </UPopover>
                  <PlatformNotificationItem v-else :item="item" @open="openItem" />
                </li>
              </ul>
            </div>
            <div v-if="list.hasNextPage.value" class="p-2">
              <UButton
                block
                size="sm"
                color="neutral"
                variant="ghost"
                :loading="list.isFetchingNextPage.value"
                @click="list.fetchNextPage()"
              >
                {{ t('notifications.menu.loadMore') }}
              </UButton>
            </div>
          </template>
        </div>
      </section>
    </template>
  </UPopover>
</template>

<style scoped>
.nt-badge {
  position: absolute;
  top: 2px;
  right: 1px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--app-bad);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}
.nt {
  width: min(400px, calc(100vw - 16px));
  display: flex;
  flex-direction: column;
  max-height: min(560px, calc(100dvh - 80px));
}
.nt-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 12px 8px 16px;
}
.nt-h h2 {
  font-size: 15px;
  font-weight: 650;
}
.nt-tabs {
  padding: 0 12px 8px;
  border-bottom: 1px solid var(--app-border);
}
.nt-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: 6px;
}
.nt-body ul {
  display: grid;
  gap: 2px;
}
.nt-g {
  padding: 10px 16px 4px;
}
.nt-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px;
  color: var(--app-bad);
  font-size: 13px;
}
</style>

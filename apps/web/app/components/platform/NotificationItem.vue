<script setup lang="ts">
import type { Notification } from '../../types/notifications'

const props = defineProps<{ item: Notification }>()
const emit = defineEmits<{ open: [item: Notification] }>()

const { t } = useI18n()
const dates = useDates()
const entities = useApprovalEntityRegistry()

// The record's icon when the sender named one (e.g. the note an approval is for), else a bell.
const icon = computed(() => (props.item.subject ? entities.icon(props.item.subject.type) : 'i-lucide-bell'))
</script>

<template>
  <button
    type="button"
    class="ni"
    :class="{ unread: !item.readAt }"
    data-testid="notification-item"
    @click="emit('open', item)"
  >
    <span class="ni-tile" aria-hidden="true"><UIcon :name="icon" class="size-4" /></span>
    <span class="min-w-0 flex-1">
      <span v-if="!item.readAt" class="sr-only">{{ t('notifications.menu.unread') }}:</span>
      <b>{{ item.title }}</b>
      <span v-if="item.body" class="ni-text">{{ item.body }}</span>
      <time :datetime="item.createdAt" :title="dates.dateTime(item.createdAt)">
        {{ dates.relative(item.createdAt) }}
      </time>
    </span>
    <span class="ni-dot" aria-hidden="true" />
  </button>
</template>

<style scoped>
.ni {
  display: flex;
  gap: 12px;
  width: calc(100% - 12px);
  margin: 0 6px;
  padding: 10px;
  border-radius: 10px;
  text-align: left;
  transition: background var(--app-dur-fast, 0.12s);
}
.ni:hover,
.ni:focus-visible,
.ni[data-state='open'] {
  background: var(--app-hover);
}
.ni.unread {
  background: color-mix(in oklab, var(--app-accent) 7%, transparent);
}
.ni.unread:hover,
.ni.unread:focus-visible,
.ni.unread[data-state='open'] {
  background: color-mix(in oklab, var(--app-accent) 12%, transparent);
}
.ni-tile {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: color-mix(in oklab, var(--app-accent) 12%, var(--app-surface));
  color: var(--app-accent);
}
.ni b {
  display: block;
  font-size: 13.5px;
  font-weight: 600;
}
.ni:not(.unread) b {
  font-weight: 500;
}
.ni-text {
  display: block;
  margin-top: 1px;
  color: var(--app-muted);
  font-size: 12.5px;
}
.ni time {
  display: block;
  margin-top: 3px;
  color: var(--app-muted);
  font-size: 11.5px;
}
.ni-dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
}
.unread .ni-dot {
  background: var(--app-accent);
}
</style>

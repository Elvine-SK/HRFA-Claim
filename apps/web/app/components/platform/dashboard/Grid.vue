<script setup lang="ts">
import type { LayoutItem, WidgetSize } from '@elvine-sk/platform-nuxt/utils'

const props = defineProps<{ items: LayoutItem[]; editing: boolean }>()
const emit = defineEmits<{
  move: [id: string, to: number]
  resize: [id: string, size: WidgetSize]
  remove: [id: string]
  add: []
}>()
const { t } = useI18n()
const registry = useWidgetRegistry()

// Native drag-and-drop in edit mode, started from a card's grip; the move buttons are the keyboard and touch
// alternative.
const dragging = ref<string | null>(null)
const marker = ref<{ index: number; after: boolean; stacked: boolean } | null>(null)
const markerOf = (index: number) => {
  const m = marker.value
  if (m?.index !== index) return null
  return m.stacked ? (m.after ? 'below' : 'above') : m.after ? 'after' : 'before'
}

function onDragStart(event: DragEvent, id: string) {
  if (!props.editing) return
  dragging.value = id
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent, index: number) {
  if (!dragging.value) return
  event.preventDefault()
  const cell = event.currentTarget as HTMLElement
  const rect = cell.getBoundingClientRect()
  // A card that fills its row has neighbours above and below, not beside it.
  const stacked = rect.width >= (cell.parentElement?.clientWidth ?? Infinity) - 1
  const after = stacked
    ? event.clientY > rect.top + rect.height / 2
    : event.clientX > rect.left + rect.width / 2
  marker.value = { index, after, stacked }
}

function onDragEnd() {
  dragging.value = null
  marker.value = null
}

function onDrop() {
  const id = dragging.value
  const from = props.items.findIndex((item) => item.id === id)
  if (id && from >= 0 && marker.value) {
    let to = marker.value.index + (marker.value.after ? 1 : 0)
    if (from < to) to -= 1
    if (to !== from) emit('move', id, to)
  }
  onDragEnd()
}
</script>

<template>
  <div class="dash-grid" data-testid="dashboard-grid">
    <template v-for="(item, index) in items" :key="item.id">
      <PlatformDashboardCell
        v-if="registry.get(item.id)"
        :widget="registry.get(item.id)!"
        :item="item"
        :index="index"
        :count="items.length"
        :editing="editing"
        :marker="markerOf(index)"
        @dragstart="onDragStart($event, item.id)"
        @dragover="onDragOver($event, index)"
        @drop.prevent="onDrop"
        @dragend="onDragEnd"
        @move="(to: number) => emit('move', item.id, to)"
        @resize="(size: WidgetSize) => emit('resize', item.id, size)"
        @remove="emit('remove', item.id)"
      />
    </template>
    <button v-if="editing" type="button" class="dash-add" @click="emit('add')">
      <UIcon name="i-lucide-plus" class="size-4" />
      {{ t('dashboard.addWidget') }}
    </button>
  </div>
</template>

<style scoped>
.dash-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--app-gap);
  align-items: stretch;
}
.dash-add {
  display: flex;
  min-height: 150px;
  grid-column: span 4;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 2px dashed var(--app-border);
  border-radius: var(--app-r-lg);
  color: var(--app-muted);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color var(--app-dur-base),
    color var(--app-dur-base);
}
.dash-add:hover {
  border-color: var(--app-accent);
  color: var(--app-accent);
}
@media (max-width: 1100px) {
  .dash-grid > :deep(.dash-cell),
  .dash-add {
    grid-column: 1 / -1 !important;
  }
}
</style>

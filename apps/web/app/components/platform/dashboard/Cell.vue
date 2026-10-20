<script setup lang="ts">
import {
  WIDGET_COLUMNS,
  type DashboardWidget,
  type LayoutItem,
  type WidgetSize,
} from '@elvine-sk/platform-nuxt/utils'

const props = defineProps<{
  widget: DashboardWidget
  item: LayoutItem
  index: number
  count: number
  editing: boolean
  marker?: 'before' | 'after' | 'above' | 'below' | null
}>()
const emit = defineEmits<{ move: [to: number]; resize: [size: WidgetSize]; remove: [] }>()
const { t } = useI18n()
const title = computed(() => t(props.widget.title))
const root = ref<HTMLElement>()
const bar = ref<HTMLElement>()

// A widget that draws its own header already shows the name; the edit bar then leaves it out.
const hasHeader = ref(false)
provide('dashboard-cell-header', hasHeader)

// The grip is the drag handle; the picture that follows the pointer is the whole card.
function onGripDrag(event: DragEvent) {
  const el = root.value
  if (!el || !event.dataTransfer) return
  const rect = el.getBoundingClientRect()
  event.dataTransfer.setDragImage(el, event.clientX - rect.left, event.clientY - rect.top)
}

// One tab stop per toolbar; the arrow keys, Home and End move between its buttons.
const stops = () => [...(bar.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
function syncStop(current?: Element | null) {
  const list = stops()
  const stop = list.find((b) => b === current) ?? list.find((b) => b.tabIndex === 0) ?? list[0]
  for (const b of bar.value?.querySelectorAll('button') ?? []) b.tabIndex = b === stop ? 0 : -1
}
onMounted(() => syncStop())
onUpdated(() => syncStop())

function onBarKeydown(event: KeyboardEvent) {
  const list = stops()
  const at = list.indexOf(event.target as HTMLButtonElement)
  const to =
    event.key === 'ArrowRight'
      ? (at + 1) % list.length
      : event.key === 'ArrowLeft'
        ? (at - 1 + list.length) % list.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? list.length - 1
            : -1
  if (at < 0 || to < 0) return
  event.preventDefault()
  list[to]?.focus()
}

// Reordering moves the card in the page, which drops focus, and the end of the row disables the button.
let refocus: HTMLButtonElement | null = null
function move(to: number, event: MouseEvent) {
  refocus = event.currentTarget as HTMLButtonElement
  emit('move', to)
}
watch(
  () => props.index,
  () => {
    const button = refocus
    refocus = null
    if (!button) return
    const other = bar.value?.querySelector<HTMLButtonElement>('.dash-ib:not(:disabled)')
    ;(button.disabled ? other : button)?.focus()
  },
  { flush: 'post' },
)

// A widget that throws while rendering shows an inline error; the rest of the dashboard keeps working.
const failed = ref<unknown>(null)
onErrorCaptured((error) => {
  failed.value = error
  console.error(`[dashboard] widget "${props.widget.id}" failed`, error)
  return false
})
</script>

<template>
  <section
    ref="root"
    class="dash-cell"
    :class="[{ editing }, marker ? `drop-${marker}` : '']"
    :style="{ gridColumn: `span ${WIDGET_COLUMNS[item.size]}` }"
    :data-widget="widget.id"
    :data-size="item.size"
    :aria-label="title"
  >
    <div
      v-if="editing"
      ref="bar"
      class="dash-bar"
      role="toolbar"
      :aria-label="t('dashboard.toolbar', { title })"
      @keydown="onBarKeydown"
      @focusin="syncStop($event.target as Element)"
    >
      <span class="dash-grip" draggable="true" data-testid="widget-grip" @dragstart="onGripDrag">
        <UIcon name="i-lucide-grip-vertical" class="size-4" aria-hidden="true" />
      </span>
      <b class="min-w-0 flex-1 truncate" data-testid="widget-bar-title">{{ hasHeader ? '' : title }}</b>
      <button
        type="button"
        class="dash-ib"
        :disabled="index === 0"
        :aria-label="t('dashboard.moveBack', { title })"
        @click="move(index - 1, $event)"
      >
        <UIcon name="i-lucide-chevron-left" />
      </button>
      <button
        type="button"
        class="dash-ib"
        :disabled="index === count - 1"
        :aria-label="t('dashboard.moveForward', { title })"
        @click="move(index + 1, $event)"
      >
        <UIcon name="i-lucide-chevron-right" />
      </button>
      <div class="dash-sizes" role="group" :aria-label="t('dashboard.size')">
        <button
          v-for="size in widget.sizes"
          :key="size"
          type="button"
          class="mono"
          :aria-pressed="size === item.size"
          :aria-label="t('dashboard.sizeTo', { size: t(`dashboard.sizes.${size}`) })"
          @click="emit('resize', size)"
        >
          {{ size.toUpperCase() }}
        </button>
      </div>
      <button
        type="button"
        class="dash-ib danger"
        :aria-label="t('dashboard.remove', { title })"
        @click="emit('remove')"
      >
        <UIcon name="i-lucide-x" />
      </button>
    </div>
    <PlatformDashboardWidgetFrame
      v-if="failed"
      :title="title"
      :icon="widget.icon"
      :error="failed"
      @retry="failed = null"
    />
    <component :is="widget.component" v-else :size="item.size" />
  </section>
</template>

<style scoped>
.dash-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-lg);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}
.dash-cell > :last-child {
  flex: 1;
}
.dash-cell.editing {
  outline: 2px dashed color-mix(in oklab, var(--app-accent) 35%, transparent);
  outline-offset: 3px;
}
.dash-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 8px 7px 10px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface-2);
  font-size: 12.5px;
}
.dash-grip {
  display: grid;
  flex: none;
  place-items: center;
  color: var(--app-muted);
  cursor: grab;
}
.dash-bar b {
  margin-left: 4px;
  font-weight: 600;
}
.dash-ib {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-sm);
  background: var(--app-surface);
  color: var(--app-muted);
  font-size: 14px;
  cursor: pointer;
  transition:
    background-color var(--app-dur-base),
    color var(--app-dur-base);
}
.dash-ib:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text);
}
.dash-ib.danger:hover {
  border-color: var(--app-bad);
  background: var(--app-bad);
  color: #fff;
}
.dash-ib:disabled {
  opacity: 0.35;
  cursor: default;
}
.dash-sizes {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-sm);
  background: var(--app-surface-2);
}
.dash-sizes button {
  padding: 4px 8px;
  border-radius: calc(var(--app-r-sm) - 3px);
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.dash-sizes button[aria-pressed='true'] {
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
  color: var(--app-text);
}
.drop-before {
  box-shadow: -5px 0 0 0 var(--app-accent);
}
.drop-after {
  box-shadow: 5px 0 0 0 var(--app-accent);
}
.drop-above {
  box-shadow: 0 -5px 0 0 var(--app-accent);
}
.drop-below {
  box-shadow: 0 5px 0 0 var(--app-accent);
}
</style>

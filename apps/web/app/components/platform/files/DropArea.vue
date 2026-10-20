<script setup lang="ts">
/**
 * The dashed area files are dropped on or picked from. The parent owns the file input and the drag events
 * (a drop anywhere on its card counts); this shows where, what is accepted, and lights up while dragging.
 */
const props = defineProps<{
  accept: readonly string[]
  maxBytes: number
  /** A slim strip once there are files. */
  compact?: boolean
  /** Files are being dragged over the parent. */
  active?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ pick: [] }>()
const { t } = useI18n()

const SHOWN_TYPES = 6
const limits = computed(() => {
  if (!props.maxBytes) return ''
  const max = formatBytes(props.maxBytes)
  const labels = fileTypeLabels(props.accept)
  if (!labels.length) return t('files.limitsSize', { max })
  const types = labels.slice(0, SHOWN_TYPES).join(', ')
  return labels.length > SHOWN_TYPES
    ? t('files.limitsMore', { types, n: labels.length - SHOWN_TYPES, max })
    : t('files.limits', { types, max })
})
const title = computed(() =>
  props.active ? t('files.dropNow') : props.compact ? t('files.dropMore') : t('files.dropBrowse'),
)
</script>

<template>
  <button
    type="button"
    class="drop-area"
    :class="{ 'is-compact': compact, 'is-active': active }"
    :disabled="disabled"
    data-testid="file-drop-area"
    @click="emit('pick')"
  >
    <span class="drop-area-icon" aria-hidden="true">
      <UIcon name="i-lucide-upload" :class="compact ? 'size-4' : 'size-5'" />
    </span>
    <span class="drop-area-title">{{ title }}</span>
    <span v-if="limits" class="drop-area-limits">{{ limits }}</span>
  </button>
</template>

<style scoped>
.drop-area {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 22px 16px;
  border: 1.5px dashed color-mix(in oklab, var(--app-muted) 45%, var(--app-border));
  border-radius: var(--app-r-sm);
  background: transparent;
  color: var(--app-muted);
  font-size: 13px;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    color 0.15s;
}
.drop-area:hover:not(:disabled),
.drop-area:focus-visible,
.drop-area.is-active {
  border-color: var(--app-accent);
  background: color-mix(in oklab, var(--app-accent) 6%, transparent);
  outline: none;
}
.drop-area:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--app-accent) 25%, transparent);
}
.drop-area.is-active {
  border-style: solid;
  background: color-mix(in oklab, var(--app-accent) 10%, transparent);
  color: var(--app-accent);
}
.drop-area:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.drop-area-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  margin-bottom: 4px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--app-accent) 10%, transparent);
  color: var(--app-accent);
  transition: transform 0.15s;
}
.drop-area:hover:not(:disabled) .drop-area-icon,
.drop-area.is-active .drop-area-icon {
  transform: translateY(-2px);
}
.drop-area-title {
  color: var(--app-text);
  font-weight: 600;
}
.drop-area.is-active .drop-area-title {
  color: inherit;
}
.drop-area-limits {
  font-size: 12px;
}
.drop-area.is-compact {
  flex-direction: row;
  gap: 10px;
  padding: 8px 12px;
  text-align: start;
}
.drop-area.is-compact .drop-area-icon {
  width: 26px;
  height: 26px;
  margin-bottom: 0;
}
.drop-area.is-compact .drop-area-limits {
  margin-inline-start: auto;
}
</style>

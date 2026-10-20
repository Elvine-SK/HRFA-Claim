<script setup lang="ts">
/**
 * What a widget draws inside its dashboard card: a header, then a skeleton, an inline error with Retry, or
 * the content. The card itself (border, shadow, the edit bar) belongs to the dashboard cell.
 * `bare` drops the header (the stat strip); `flush` drops the body padding (rows that run edge to edge).
 */
const props = defineProps<{
  title: string
  icon?: string
  subtitle?: string
  loading?: boolean
  error?: unknown
  bare?: boolean
  flush?: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
// Tells the dashboard cell whether this widget shows its own name (see Cell.vue).
const cellHeader = inject<Ref<boolean> | null>('dashboard-cell-header', null)
watchEffect(() => {
  if (cellHeader) cellHeader.value = !props.bare
})
const message = computed(() =>
  isApiError(props.error) && props.error.message ? props.error.message : t('dashboard.widgetFailed'),
)
</script>

<template>
  <div class="wf">
    <header v-if="!bare" class="wf-h">
      <div class="min-w-0">
        <h2>
          <UIcon v-if="icon" :name="icon" class="wf-ico" />
          <span class="truncate">{{ title }}</span>
        </h2>
        <p v-if="subtitle" class="truncate">{{ subtitle }}</p>
      </div>
      <slot name="action" />
    </header>
    <div v-if="error" class="wf-b flex flex-col items-start gap-2" role="alert" data-testid="widget-error">
      <p class="text-sm text-muted">{{ message }}</p>
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-rotate-cw" @click="emit('retry')">
        {{ t('platform.actions.retry') }}
      </UButton>
    </div>
    <div v-else-if="loading" class="wf-b flex flex-col gap-3" aria-busy="true">
      <slot name="skeleton">
        <USkeleton v-for="n in 4" :key="n" class="h-5 w-3/4" />
      </slot>
    </div>
    <div v-else class="wf-body" :class="{ 'wf-b': !flush }">
      <slot />
    </div>
    <footer v-if="$slots.footer && !error && !loading" class="wf-f">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.wf {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}
.wf-h {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: var(--app-pad) var(--app-pad) 0;
}
.wf-h h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
}
.wf-ico {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--app-muted);
}
.wf-h p {
  margin-top: 3px;
  color: var(--app-muted);
  font-size: 12.5px;
}
.wf-body {
  flex: 1;
  min-height: 0;
}
.wf-b {
  padding: 14px var(--app-pad) var(--app-pad);
}
.wf-f {
  padding: 0 var(--app-pad) var(--app-pad);
  font-size: 13px;
}
</style>

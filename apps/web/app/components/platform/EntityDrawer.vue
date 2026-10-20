<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    icon?: string
    loading?: boolean
    width?: 'entity' | 'editor'
  }>(),
  { title: '', subtitle: undefined, icon: 'i-lucide-file-text', loading: false, width: 'entity' },
)
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="subtitle"
    :ui="{ content: width === 'editor' ? 'max-w-[660px]' : 'max-w-[440px]' }"
  >
    <template #content>
      <div class="flex h-full flex-col overflow-y-auto bg-default">
        <div class="band">
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            square
            class="band-close"
            :aria-label="t('platform.actions.close')"
            @click="open = false"
          />
        </div>
        <div class="dw-id">
          <span class="tile" aria-hidden="true"><UIcon :name="icon" class="size-8" /></span>
          <div class="min-w-0 pt-[42px]">
            <USkeleton v-if="loading" class="h-6 w-48" />
            <h2 v-else>{{ title }}</h2>
            <p v-if="subtitle">{{ subtitle }}</p>
            <div v-if="$slots.badges" class="mt-1.5 flex flex-wrap gap-1.5"><slot name="badges" /></div>
          </div>
        </div>
        <div v-if="$slots.actions" class="dw-actions"><slot name="actions" /></div>
        <slot />
      </div>
    </template>
  </USlideover>
</template>

<style scoped>
.band {
  position: relative;
  height: 96px;
  flex: none;
  background: var(--app-grad);
  opacity: 0.9;
}
.band-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: color-mix(in oklab, var(--app-grad-fg) 14%, transparent);
  color: var(--app-grad-fg);
}
.band-close:hover {
  background: color-mix(in oklab, var(--app-grad-fg) 24%, transparent);
  color: var(--app-grad-fg);
}
.dw-id {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-top: -36px;
  padding: 0 24px;
}
.tile {
  display: grid;
  width: 76px;
  height: 76px;
  flex: none;
  place-items: center;
  border: 4px solid var(--app-surface);
  border-radius: var(--app-r-lg);
  background: color-mix(in oklab, var(--app-accent) 14%, var(--app-surface));
  color: var(--app-accent);
}
h2 {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}
.dw-id p {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 13px;
}
.dw-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 24px 6px;
}
</style>

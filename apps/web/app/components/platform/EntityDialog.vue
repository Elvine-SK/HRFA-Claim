<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    icon?: string
    loading?: boolean
    size?: 'md' | 'lg' | 'xl'
  }>(),
  { title: '', subtitle: undefined, icon: 'i-lucide-file-text', loading: false, size: 'lg' },
)
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()

const phone = useMediaQuery('(max-width: 639px)')
const WIDTHS = { md: 'sm:max-w-[640px]', lg: 'sm:max-w-[860px]', xl: 'sm:max-w-[1100px]' }
const content = computed(() =>
  phone.value ? 'max-w-none' : `${WIDTHS[props.size]} max-h-[90vh] overflow-hidden divide-y-0`,
)
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="subtitle" :fullscreen="phone" :ui="{ content }">
    <template #content>
      <div class="ed-box flex min-h-0 flex-1 flex-col bg-default" :class="phone ? 'h-dvh' : 'max-h-[90vh]'">
        <div class="ed-head">
          <div class="ed-band">
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              square
              class="ed-close"
              :aria-label="t('platform.actions.close')"
              @click="open = false"
            />
          </div>
          <div class="ed-id">
            <span class="ed-tile" aria-hidden="true"><UIcon :name="icon" class="size-8" /></span>
            <div class="min-w-0 pt-[42px]">
              <USkeleton v-if="loading" class="h-6 w-48" />
              <h2 v-else>{{ title }}</h2>
              <p v-if="subtitle">{{ subtitle }}</p>
              <div v-if="$slots.badges" class="mt-1.5 flex flex-wrap gap-1.5"><slot name="badges" /></div>
            </div>
          </div>
          <div v-if="$slots.actions" class="ed-actions"><slot name="actions" /></div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto"><slot /></div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.ed-head {
  flex: none;
  padding-bottom: 6px;
}
.ed-band {
  position: relative;
  height: 96px;
  background: var(--app-grad);
  opacity: 0.9;
}
.ed-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: color-mix(in oklab, var(--app-grad-fg) 14%, transparent);
  color: var(--app-grad-fg);
}
.ed-close:hover {
  background: color-mix(in oklab, var(--app-grad-fg) 24%, transparent);
  color: var(--app-grad-fg);
}
.ed-id {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-top: -36px;
  padding: 0 24px;
}
.ed-tile {
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
.ed-id p {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 13px;
}
.ed-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 24px 0;
}
</style>

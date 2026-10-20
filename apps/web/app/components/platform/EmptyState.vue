<script setup lang="ts">
import type { Tone } from '../../utils/tone'

export type EmptyKind = 'first-use' | 'no-results' | 'all-done'

const props = withDefaults(
  defineProps<{ kind?: EmptyKind; title: string; text?: string; icon?: string; tone?: Tone }>(),
  {
    kind: 'first-use',
    text: undefined,
    icon: undefined,
    tone: undefined,
  },
)

const DEFAULTS: Record<EmptyKind, { icon: string; tone: Tone }> = {
  'first-use': { icon: 'i-lucide-sparkles', tone: 'accent' },
  'no-results': { icon: 'i-lucide-search-x', tone: 'neutral' },
  'all-done': { icon: 'i-lucide-party-popper', tone: 'success' },
}

const resolvedIcon = computed(() => props.icon ?? DEFAULTS[props.kind].icon)
const resolvedTone = computed(() => props.tone ?? DEFAULTS[props.kind].tone)
</script>

<template>
  <div class="empty" role="status">
    <span class="tile" :style="{ '--k': toneVar(resolvedTone) }" aria-hidden="true">
      <UIcon :name="resolvedIcon" class="size-7" />
    </span>
    <p class="title">{{ title }}</p>
    <p v-if="text" class="text">{{ text }}</p>
    <div v-if="$slots.actions" class="mt-4 flex flex-wrap justify-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 20px;
  text-align: center;
}
.tile {
  position: relative;
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  margin-bottom: 16px;
  border-radius: var(--app-r-md);
  background: color-mix(in oklab, var(--k) 12%, var(--app-surface));
  color: var(--k);
}
.tile::before {
  content: '';
  position: absolute;
  inset: -8px;
  border: 1.5px dashed color-mix(in oklab, var(--k) 35%, transparent);
  border-radius: calc(var(--app-r-md) + 8px);
}
.title {
  font-size: 15px;
  font-weight: 600;
}
.text {
  max-width: 300px;
  margin-top: 4px;
  color: var(--app-muted);
  font-size: 13px;
}
</style>

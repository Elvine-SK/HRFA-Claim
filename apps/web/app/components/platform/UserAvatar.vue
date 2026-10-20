<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name?: string | null
    seed?: string | null
    size?: 'xs' | 'sm' | 'md' | 'lg'
    label?: boolean
  }>(),
  { name: null, seed: null, size: 'md', label: false },
)
const hue = computed(() => hueOf(props.seed ?? props.name))
</script>

<template>
  <span class="ua" :class="size">
    <span class="av" :style="{ '--h': hue }" aria-hidden="true">{{ initialsOf(name) }}</span>
    <span v-if="label" class="nm">{{ name }}</span>
  </span>
</template>

<style scoped>
.ua {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.av {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: oklch(0.92 0.05 var(--h));
  color: oklch(0.38 0.1 var(--h));
  font-size: 11px;
  font-weight: 700;
}
:global(.dark) .av {
  background: oklch(0.36 0.07 var(--h));
  color: oklch(0.92 0.05 var(--h));
}
.xs .av {
  width: 22px;
  height: 22px;
  font-size: 9px;
}
.sm .av {
  width: 26px;
  height: 26px;
  font-size: 10px;
}
.lg .av {
  width: 48px;
  height: 48px;
  font-size: 16px;
}
.nm {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

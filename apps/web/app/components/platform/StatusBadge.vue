<script setup lang="ts">
import type { Tone } from '../../utils/tone'

withDefaults(defineProps<{ tone?: Tone; label: string; dot?: boolean }>(), { tone: 'neutral', dot: true })
</script>

<!-- Colour, text and a dot: status is never shown by colour alone. -->
<template>
  <span class="badge" :style="{ '--sc': toneVar(tone) }">
    <i v-if="dot" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px 3px 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--sc) 14%, transparent);
  color: color-mix(in oklab, var(--sc) 75%, var(--app-text));
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
}
.badge i {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--sc);
}
</style>

<script setup lang="ts">
import type { WizardStep } from '@elvine-sk/platform-nuxt/utils'

defineProps<{ steps: WizardStep[]; current: number; furthest: number; disabled?: boolean }>()
const emit = defineEmits<{ go: [index: number] }>()
</script>

<template>
  <ol class="wz-steps">
    <li v-for="(step, i) in steps" :key="step.key" :class="{ done: i < current, cur: i === current }">
      <button
        type="button"
        class="wz-step"
        :disabled="disabled || i > furthest"
        :aria-current="i === current ? 'step' : undefined"
        @click="emit('go', i)"
      >
        <span class="wz-dot" aria-hidden="true">
          <UIcon v-if="i < current" name="i-lucide-check" class="size-3.5" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span class="min-w-0 text-left">
          <b class="block truncate">{{ step.label }}</b>
          <small v-if="step.caption" class="block truncate">{{ step.caption }}</small>
        </span>
      </button>
    </li>
  </ol>
</template>

<style scoped>
.wz-steps {
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.wz-steps li {
  flex: 1;
  min-width: 0;
}
.wz-step {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--app-r-sm);
  color: var(--app-muted);
  font-size: 13px;
  transition: background var(--app-dur-base);
}
.wz-step:not(:disabled):hover {
  background: var(--app-hover);
}
.wz-step:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.wz-step small {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--app-muted);
}
.wz-dot {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.done .wz-step,
.cur .wz-step {
  color: var(--app-text);
}
.done .wz-dot {
  border-color: var(--app-ok);
  background: var(--app-ok);
  color: #fff;
}
.cur .wz-dot {
  border-color: var(--app-accent);
  background: var(--app-accent);
  color: #fff;
}
@media (max-width: 640px) {
  .wz-step small {
    display: none;
  }
  li:not(.cur) .wz-step b {
    display: none;
  }
}
</style>

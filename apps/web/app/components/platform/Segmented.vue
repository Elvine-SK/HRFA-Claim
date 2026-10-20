<script setup lang="ts" generic="T extends string">
defineProps<{
  options: { value: T; label: string; icon?: string; iconOnly?: boolean }[]
  label: string
  disabled?: boolean
  block?: boolean
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="seg" :class="{ block }" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="model === option.value"
      :aria-label="option.iconOnly ? option.label : undefined"
      :title="option.iconOnly ? option.label : undefined"
      :disabled="disabled"
      :class="{ 'icon-only': option.iconOnly }"
      @click="model = option.value"
    >
      <UIcon v-if="option.icon" :name="option.icon" class="size-[15px] shrink-0" />
      <span v-if="!option.iconOnly">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-sm);
  background: var(--app-surface-2);
}
.seg.block {
  display: flex;
}
.seg button {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  border: 0;
  border-radius: max(0px, calc(var(--app-r-sm) - 3px));
  background: none;
  color: var(--app-muted);
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--app-dur-base),
    color var(--app-dur-base);
}
.seg button.icon-only {
  width: 30px;
  height: 28px;
  padding: 0;
}
.seg button:hover:not(:disabled) {
  color: var(--app-text);
}
.seg button[aria-pressed='true'] {
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
  color: var(--app-text);
  font-weight: 600;
}
.seg button:disabled {
  cursor: not-allowed;
}
</style>

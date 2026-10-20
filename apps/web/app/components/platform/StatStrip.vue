<script setup lang="ts">
import type { Tone } from '../../utils/tone'

export interface StatItem {
  label: string
  value: string | number | null | undefined
  unit?: string
  icon?: string
  tone?: Tone
  delta?: { value: string; good: boolean }
  /** One short line of detail under the value. */
  hint?: string
  /** Makes the stat a button, e.g. to filter the list below by it. */
  onClick?: () => void
  /** The list below is filtered by this stat. */
  active?: boolean
}

/** `flush` drops the strip's own card (border, shadow, margin) when it sits inside another card. */
defineProps<{ items: StatItem[]; loading?: boolean; flush?: boolean }>()
</script>

<template>
  <section
    class="stats"
    :class="{ flush }"
    :style="{ '--cols': Math.min(items.length, 6), '--cols-md': Math.min(items.length, 3) }"
  >
    <component
      :is="item.onClick ? 'button' : 'div'"
      v-for="item in items"
      :key="item.label"
      class="stat"
      :class="{ 'is-active': item.active }"
      :type="item.onClick ? 'button' : undefined"
      :aria-pressed="item.onClick ? !!item.active : undefined"
      :style="{ '--k': toneVar(item.tone ?? 'accent') }"
      @click="item.onClick?.()"
    >
      <p class="lbl">
        <span class="truncate">{{ item.label }}</span>
        <UIcon v-if="item.icon" :name="item.icon" class="ico" />
      </p>
      <USkeleton v-if="loading" class="h-8 w-16" />
      <p v-else class="v mono">
        {{ item.value ?? '—' }}<small v-if="item.unit">{{ item.unit }}</small>
      </p>
      <p class="foot">
        <span v-if="item.delta" class="delta mono" :class="item.delta.good ? 'good' : 'bad'">
          <UIcon
            :name="item.delta.good ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'"
            class="size-3"
          />
          {{ item.delta.value }}
        </span>
        <span v-if="item.hint" class="hint">{{ item.hint }}</span>
      </p>
    </component>
  </section>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  overflow: hidden;
  margin-bottom: var(--app-gap);
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-lg);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}
.stats.flush {
  margin: 0;
  border: 0;
  border-radius: inherit;
  background: none;
  box-shadow: none;
}
.stat {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  padding: 16px 18px 14px;
  border-right: 1px solid var(--app-border);
  transition: background-color var(--app-dur-base);
}
.stat:last-child {
  border-right: 0;
}
.stat:hover {
  background: var(--app-hover);
}
/* No specificity: the borders of `.stat` still apply to a stat that is a button. */
:where(button.stat) {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
button.stat:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: -2px;
}
.stat.is-active {
  background: color-mix(in oklab, var(--k) 8%, transparent);
  box-shadow: inset 0 -2px 0 var(--k);
}
.lbl {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: var(--app-muted);
  font-size: 12.5px;
  font-weight: 500;
}
.ico {
  width: 15px;
  height: 15px;
  flex: none;
  color: var(--k);
}
.v {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.2;
}
.v small {
  margin-left: 2px;
  color: var(--app-muted);
  font-size: 13px;
  letter-spacing: 0;
}
.foot {
  min-height: 18px;
}
.hint {
  color: var(--app-muted);
  font-size: 12px;
}
.delta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.delta.good {
  background: color-mix(in oklab, var(--app-ok) 13%, transparent);
  color: var(--app-ok);
}
.delta.bad {
  background: color-mix(in oklab, var(--app-bad) 13%, transparent);
  color: var(--app-bad);
}
@media (max-width: 1280px) {
  .stats {
    grid-template-columns: repeat(var(--cols-md), minmax(0, 1fr));
  }
  .stat {
    border-bottom: 1px solid var(--app-border);
  }
}
@media (max-width: 640px) {
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

<script setup lang="ts">
import type { Tone } from '../../utils/tone'

export interface TimelineEvent {
  id: string
  icon: string
  tone?: Tone
  /** ISO timestamp. */
  at: string
}

const props = defineProps<{ events: TimelineEvent[] }>()
const { dateTime, relative, date } = useDates()

const groups = computed(() => {
  const out = new Map<string, TimelineEvent[]>()
  for (const event of props.events) {
    const day = date(event.at, 'YYYY-MM-DD')
    out.set(day, [...(out.get(day) ?? []), event])
  }
  return [...out]
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <section v-for="[day, items] in groups" :key="day">
      <h3 class="eyebrow mb-1">{{ date(day) }}</h3>
      <ol class="tl">
        <li
          v-for="event in items"
          :key="event.id"
          class="tl-i"
          :style="{ '--k': toneVar(event.tone ?? 'accent') }"
        >
          <span class="ic" aria-hidden="true"><UIcon :name="event.icon" class="size-3.5" /></span>
          <div class="min-w-0 text-[13px] leading-normal"><slot :event="event" /></div>
          <UTooltip :text="dateTime(event.at)">
            <time class="mono" :datetime="event.at" tabindex="0">{{ relative(event.at) }}</time>
          </UTooltip>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.tl {
  margin: 0;
  padding: 0;
  list-style: none;
}
.tl-i {
  position: relative;
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: 12px;
  padding: 10px 0;
}
.tl-i::before {
  content: '';
  position: absolute;
  top: 42px;
  bottom: -10px;
  left: 15px;
  width: 2px;
  background: var(--app-border);
}
.tl-i:last-child::before {
  display: none;
}
.ic {
  position: relative;
  z-index: 1;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid color-mix(in oklab, var(--k) 25%, transparent);
  border-radius: 50%;
  background: color-mix(in oklab, var(--k) 14%, var(--app-surface));
  color: var(--k);
}
time {
  color: var(--app-muted);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
}
</style>

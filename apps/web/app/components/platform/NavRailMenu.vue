<script setup lang="ts">
import type { VisibleItem } from '@elvine-sk/platform-nuxt/utils'

// In the icon rail, a parent opens this menu on click, listing every level under it.
const props = defineProps<{
  item: VisibleItem
  activeId?: string
  trailIds: Set<string>
  /** A child out of sight has a hot count. */
  hotDot?: boolean
}>()

const { t, te } = useI18n()
const label = (text: string) => (te(text) ? t(text) : text)
const open = ref(false)

const rows = computed(() => {
  const out: { item: VisibleItem; depth: number }[] = []
  const visit = (items: VisibleItem[], depth: number) => {
    for (const child of items) {
      out.push({ item: child, depth })
      visit(child.children, depth + 1)
    }
  }
  if (props.item.link) out.push({ item: props.item, depth: 0 })
  visit(props.item.children, props.item.link ? 1 : 0)
  return out
})
const current = computed(() => props.item.id === props.activeId || props.trailIds.has(props.item.id))
</script>

<template>
  <UPopover v-model:open="open" :content="{ side: 'right', align: 'start', sideOffset: 10 }">
    <button
      type="button"
      class="rail-a"
      :class="{ on: current }"
      :aria-label="label(item.label)"
      :aria-expanded="open"
      aria-haspopup="menu"
    >
      <UIcon v-if="item.icon" :name="item.icon" class="ico" />
      <span v-if="item.hot || hotDot" class="dot" aria-hidden="true" />
    </button>
    <template #content>
      <div class="rm">
        <div class="rm-h">{{ label(item.label) }}</div>
        <ul role="menu">
          <li
            v-for="row in rows"
            :key="row.item.id"
            role="none"
            :style="{ paddingLeft: `${row.depth * 14}px` }"
          >
            <NuxtLink
              v-if="row.item.link"
              role="menuitem"
              :to="row.item.to"
              class="rm-a"
              :class="{ on: row.item.id === activeId }"
              :aria-current="row.item.id === activeId ? 'page' : undefined"
              @click="open = false"
            >
              <span class="lbl">{{ label(row.item.label) }}</span>
              <span v-if="row.item.count != null" class="count mono" :class="{ hot: row.item.hot }">{{
                row.item.count
              }}</span>
            </NuxtLink>
            <span v-else role="presentation" class="rm-a rm-sub">{{ label(row.item.label) }}</span>
          </li>
        </ul>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.rail-a {
  position: relative;
  display: flex;
  width: 100%;
  height: 38px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--app-r-sm);
  background: none;
  color: var(--app-muted);
  cursor: pointer;
}
.rail-a:hover {
  background: var(--app-hover);
  color: var(--app-text);
}
.rail-a.on {
  background: color-mix(in oklab, var(--app-accent) 11%, transparent);
  color: var(--app-accent);
}
.ico {
  width: 18px;
  height: 18px;
}
.dot {
  position: absolute;
  top: 5px;
  right: 9px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--app-grad);
}
.rm {
  min-width: 210px;
  max-width: 280px;
  padding: 6px;
}
.rm ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.rm-h {
  padding: 6px 8px;
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rm-a {
  display: flex;
  height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-radius: var(--app-r-sm);
  color: var(--app-text);
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
}
a.rm-a:hover {
  background: var(--app-hover);
}
.rm-a.on {
  background: color-mix(in oklab, var(--app-accent) 11%, transparent);
  font-weight: 600;
}
.rm-sub {
  color: var(--app-muted);
  font-weight: 600;
}
.lbl {
  overflow: hidden;
  text-overflow: ellipsis;
}
.count {
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--app-surface-2);
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
}
.count.hot {
  background: var(--app-grad);
  color: var(--app-grad-fg);
}
</style>

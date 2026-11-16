<script setup lang="ts">
import type { VisibleItem } from '@elvine-sk/platform-nuxt/utils'

// One level of the side nav; parents render their children with this same component.
const props = withDefaults(
  defineProps<{
    items: VisibleItem[]
    /** 1 for top-level items. */
    depth?: number
    rail?: boolean
    open: Set<string>
    activeId?: string
    trailIds: Set<string>
  }>(),
  { depth: 1, rail: false, activeId: undefined },
)
const emit = defineEmits<{ toggle: [id: string] }>()

const { t, te } = useI18n()
const label = (text: string) => (te(text) ? t(text) : text)
const isOpen = (item: VisibleItem) => props.open.has(item.id)
const hasKids = (item: VisibleItem) => item.children.length > 0
const rowClass = (item: VisibleItem) => ({
  on: item.id === props.activeId,
  trail: item.id !== props.activeId && props.trailIds.has(item.id),
})
// A closed parent shows the hot dot of a child out of sight.
const hotDot = (item: VisibleItem) => item.hotBelow && !isOpen(item) && !item.hot
</script>

<template>
  <ul class="nt" :class="{ kids: depth > 1 }">
    <li v-for="item in items" :key="item.id">
      <template v-if="rail && depth === 1">
        <PlatformNavRailMenu
          v-if="hasKids(item)"
          :item="item"
          :active-id="activeId"
          :trail-ids="trailIds"
          :hot-dot="item.hotBelow && !item.hot"
        />
        <UTooltip v-else :text="label(item.label)" :content="{ side: 'right', sideOffset: 10 }">
          <NuxtLink
            :to="item.to"
            class="nav-a"
            :class="rowClass(item)"
            :aria-current="item.id === activeId ? 'page' : undefined"
            :aria-label="label(item.label)"
          >
            <UIcon v-if="item.icon" :name="item.icon" class="ico" />
            <span v-if="item.count != null" class="count mono" :class="{ hot: item.hot }">{{
              item.count
            }}</span>
          </NuxtLink>
        </UTooltip>
      </template>

      <template v-else>
        <div v-if="item.link" class="row">
          <NuxtLink
            :to="item.to"
            class="nav-a"
            :class="rowClass(item)"
            :aria-current="item.id === activeId ? 'page' : undefined"
          >
            <UIcon v-if="item.icon" :name="item.icon" class="ico" />
            <span class="lbl">{{ label(item.label) }}</span>
            <span v-if="item.count != null" class="count mono" :class="{ hot: item.hot }">{{
              item.count
            }}</span>
            <span v-else-if="hotDot(item)" class="dot" aria-hidden="true" />
          </NuxtLink>
          <button
            v-if="hasKids(item)"
            type="button"
            class="chev"
            :aria-expanded="isOpen(item)"
            :aria-label="
              t(isOpen(item) ? 'shell.navCollapse' : 'shell.navExpand', { name: label(item.label) })
            "
            @click="emit('toggle', item.id)"
          >
            <UIcon name="i-lucide-chevron-down" class="chev-i" :class="{ closed: !isOpen(item) }" />
          </button>
        </div>
        <button
          v-else
          type="button"
          class="nav-a row-btn"
          :class="rowClass(item)"
          :aria-expanded="isOpen(item)"
          @click="emit('toggle', item.id)"
        >
          <UIcon v-if="item.icon" :name="item.icon" class="ico" />
          <span class="lbl">{{ label(item.label) }}</span>
          <span v-if="item.count != null" class="count mono" :class="{ hot: item.hot }">{{
            item.count
          }}</span>
          <span v-else-if="hotDot(item)" class="dot" aria-hidden="true" />
          <UIcon name="i-lucide-chevron-down" class="chev-i" :class="{ closed: !isOpen(item) }" />
        </button>
        <PlatformNavTree
          v-if="hasKids(item) && isOpen(item)"
          :items="item.children"
          :depth="depth + 1"
          :open="open"
          :active-id="activeId"
          :trail-ids="trailIds"
          @toggle="emit('toggle', $event)"
        />
      </template>
    </li>
  </ul>
</template>

<style scoped>
.nt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.nt.kids {
  margin: 2px 0 2px 19px;
  padding-left: 10px;
  border-left: 1px solid var(--app-border);
}
.row {
  position: relative;
  display: flex;
  align-items: center;
}
.row .nav-a {
  flex: 1;
  min-width: 0;
}
.nav-a {
  position: relative;
  display: flex;
  width: 100%;
  height: 38px;
  align-items: center;
  gap: 11px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--app-r-sm);
  background: none;
  color: var(--app-muted);
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  text-align: left;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--app-dur-base),
    color var(--app-dur-base);
}
.kids .nav-a {
  height: 34px;
  font-size: 13px;
}
.row:has(.chev) .nav-a {
  padding-right: 34px;
}
.nav-a .ico {
  width: 18px;
  height: 18px;
  flex: none;
}
.lbl {
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-a:hover {
  background: var(--app-hover);
  color: var(--app-text);
}
.nav-a.trail {
  color: var(--app-text);
}
.nav-a.trail .ico {
  color: var(--app-accent);
}
.nav-a.on {
  background: color-mix(in oklab, var(--app-accent) 11%, transparent);
  color: var(--app-text);
  font-weight: 600;
}
.nav-a.on .ico {
  color: var(--app-accent);
}
.nav-a.on::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--app-grad);
}
.kids .nav-a.on::before {
  display: none;
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
.dot {
  width: 8px;
  height: 8px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--app-grad);
}
.row-btn .chev-i {
  margin-left: auto;
}
.row-btn .count + .chev-i,
.row-btn .dot + .chev-i {
  margin-left: 6px;
}
.chev {
  position: absolute;
  right: 6px;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--app-muted);
  cursor: pointer;
}
.chev:hover {
  background: var(--app-surface-2);
  color: var(--app-text);
}
.row:has(.chev) .count,
.row:has(.chev) .dot {
  margin-right: 0;
}
.chev-i {
  width: 15px;
  height: 15px;
  flex: none;
  color: var(--app-muted);
  transition: transform var(--app-dur-base);
}
.chev-i.closed {
  transform: rotate(-90deg);
}

/* Icon rail (collapsed sidebar): icons only, the hot count becomes a dot. */
.nt:not(.kids) > li > .nav-a:not(:has(.lbl)) {
  justify-content: center;
  padding: 0;
}
.nav-a:not(:has(.lbl)) .count {
  display: none;
}
.nav-a:not(:has(.lbl)) .count.hot {
  position: absolute;
  top: 5px;
  right: 9px;
  display: block;
  width: 8px;
  height: 8px;
  padding: 0;
  font-size: 0;
}
</style>

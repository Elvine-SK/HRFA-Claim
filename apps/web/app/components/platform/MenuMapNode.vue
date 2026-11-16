<script setup lang="ts">
import type { MenuMapRow } from '@elvine-sk/platform-nuxt/utils'

interface Node {
  row: MenuMapRow
  children: Node[]
}

// One box of the menu map diagram, with its children to the right.
defineProps<{ node: Node; judged: boolean; selected?: string }>()
const emit = defineEmits<{ select: [id: string] }>()

const { t, te } = useI18n()
const label = (text: string) => (te(text) ? t(text) : text)
const perm = (row: MenuMapRow) => {
  const spec = row.item.permission
  if (!spec) return t('admin.menuMap.anyone')
  return typeof spec === 'string' ? spec : JSON.stringify(spec).replace(/["{}[\]]/g, '')
}
</script>

<template>
  <li class="mmn">
    <button
      type="button"
      class="box"
      :class="[judged ? node.row.state : '', { sel: selected === node.row.item.id }]"
      :data-item="node.row.item.id"
      @click="emit('select', node.row.item.id)"
    >
      <span class="name">{{ label(node.row.item.label) }}</span>
      <span class="perm mono">{{ node.row.item.to ? perm(node.row) : t('admin.menuMap.opensOnly') }}</span>
    </button>
    <ul v-if="node.children.length" class="kids">
      <PlatformMenuMapNode
        v-for="child in node.children"
        :key="child.row.item.id"
        :node="child"
        :judged="judged"
        :selected="selected"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.mmn {
  display: flex;
  align-items: flex-start;
  gap: 26px;
}
.box {
  position: relative;
  display: flex;
  min-width: 150px;
  max-width: 220px;
  flex-direction: column;
  padding: 7px 10px;
  border: 1px solid color-mix(in oklab, var(--app-accent) 30%, var(--app-border));
  border-radius: 9px;
  background: color-mix(in oklab, var(--app-accent) 5%, var(--app-surface));
  color: var(--app-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.box.hidden {
  border-color: var(--app-border);
  background: var(--app-surface-2);
  color: var(--app-muted);
}
.box.toggle {
  border-style: dashed;
}
.box.sel {
  outline: 2px solid var(--app-accent);
}
.name {
  font-weight: 600;
}
.perm {
  overflow: hidden;
  color: var(--app-muted);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kids {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.kids > .mmn > .box::before {
  content: '';
  position: absolute;
  top: 50%;
  left: -26px;
  width: 26px;
  border-top: 1px solid var(--app-border);
}
</style>

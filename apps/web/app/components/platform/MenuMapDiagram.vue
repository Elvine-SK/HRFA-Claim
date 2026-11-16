<script setup lang="ts">
import type { MenuMapRow } from '@elvine-sk/platform-nuxt/utils'

// The menu map as a tree drawn left to right: a box per item, children to its right. Click a box for details.
const props = defineProps<{
  rows: MenuMapRow[]
  groupLabels: Record<string, string>
  judged: boolean
  selected?: string
}>()
const emit = defineEmits<{ select: [id: string] }>()

interface Node {
  row: MenuMapRow
  children: Node[]
}

const { t, te } = useI18n()
const label = (text: string) => (te(text) ? t(text) : text)

// Rows come depth first; rebuild the tree per group from their depths.
const trees = computed(() => {
  const out = new Map<string, Node[]>()
  const stack: Node[] = []
  for (const row of props.rows) {
    const node: Node = { row, children: [] }
    stack.length = row.depth - 1
    const parent = stack[row.depth - 2]
    if (parent) parent.children.push(node)
    else out.set(row.group, [...(out.get(row.group) ?? []), node])
    stack[row.depth - 1] = node
  }
  return [...out]
})
</script>

<template>
  <div class="mmd">
    <section v-for="[group, nodes] in trees" :key="group" class="mmd-group">
      <div class="mmd-g">{{ label(groupLabels[group] ?? group) }}</div>
      <ul class="mmd-list">
        <PlatformMenuMapNode
          v-for="node in nodes"
          :key="node.row.item.id"
          :node="node"
          :judged="judged"
          :selected="selected"
          @select="emit('select', $event)"
        />
      </ul>
    </section>
  </div>
</template>

<style scoped>
.mmd {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-x: auto;
  padding: 16px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: var(--app-surface);
}
.mmd-g {
  margin-bottom: 8px;
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.mmd-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>

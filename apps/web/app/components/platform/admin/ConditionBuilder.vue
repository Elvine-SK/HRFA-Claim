<script setup lang="ts">
import type { ConditionOp } from '@elvine-sk/platform-core'
import type { BuilderField, BuilderGroup, BuilderLeaf, BuilderNode } from '@elvine-sk/platform-nuxt/utils'

const props = withDefaults(
  defineProps<{
    fields: Record<string, BuilderField>
    depth?: number
    maxDepth?: number
    /** Variables offered for comparisons (e.g. `subject.id`). */
    variables?: readonly string[]
  }>(),
  { depth: 0, maxDepth: 2, variables: () => SUBJECT_VARS },
)
const group = defineModel<BuilderGroup>({ required: true })
const emit = defineEmits<{ remove: [] }>()
const { t } = useI18n()

const fieldItems = computed(() =>
  Object.entries(props.fields).map(([name, f]) => ({ value: name, label: name, description: f.type })),
)
const combinatorItems = computed(() => [
  { value: 'all', label: t('admin.condition.all') },
  { value: 'any', label: t('admin.condition.any') },
])

function update(patch: Partial<BuilderGroup>) {
  group.value = { ...group.value, ...patch }
}
function setItem(index: number, node: BuilderNode) {
  const items = group.value.items.slice()
  items[index] = node
  update({ items })
}
function removeItem(index: number) {
  update({ items: group.value.items.filter((_, i) => i !== index) })
}
function addLeaf() {
  const [name, field] = Object.entries(props.fields)[0] ?? ['', undefined]
  const op = fieldOps(field)[0] ?? 'eq'
  update({ items: [...group.value.items, { kind: 'leaf', field: name, op, value: defaultValue(field, op) }] })
}
function addGroup() {
  update({ items: [...group.value.items, emptyGroup(group.value.combinator === 'all' ? 'any' : 'all')] })
}

const opItems = (leaf: BuilderLeaf) =>
  fieldOps(props.fields[leaf.field]).map((op) => ({ value: op, label: t(`admin.condition.ops.${op}`) }))

function changeField(index: number, leaf: BuilderLeaf, name: string) {
  const field = props.fields[name]
  const ops = fieldOps(field)
  const op = ops.includes(leaf.op) ? leaf.op : (ops[0] ?? 'eq')
  setItem(index, { ...leaf, field: name, op, value: defaultValue(field, op) })
}
function changeOp(index: number, leaf: BuilderLeaf, op: ConditionOp) {
  const keep =
    !['in', 'nin', 'between', 'isNull'].includes(op) && !['in', 'nin', 'between', 'isNull'].includes(leaf.op)
  setItem(index, { ...leaf, op, value: keep ? leaf.value : defaultValue(props.fields[leaf.field], op) })
}
function setValue(index: number, leaf: BuilderLeaf, value: BuilderLeaf['value']) {
  setItem(index, { ...leaf, value })
}

const canUseVar = (leaf: BuilderLeaf) => {
  const type = props.fields[leaf.field]?.type
  return (type === 'uuid' || type === 'string') && (leaf.op === 'eq' || leaf.op === 'ne')
}
const inputType = (leaf: BuilderLeaf) => {
  const type = props.fields[leaf.field]?.type
  if (type === 'number' || type === 'decimal') return 'number'
  if (type === 'date') return 'date'
  if (type === 'datetime') return 'datetime-local'
  return 'text'
}
const listText = (value: unknown) => (Array.isArray(value) ? value.join(', ') : '')
const parseList = (leaf: BuilderLeaf, raw: string) =>
  raw
    .split(',')
    .map((s) => parseInput(props.fields[leaf.field], s))
    .filter((v) => v !== '')
</script>

<template>
  <div class="cb" :class="{ nested: depth > 0, negated: group.negate }">
    <div class="cb-head">
      <USelect
        :model-value="group.combinator"
        :items="combinatorItems"
        size="sm"
        class="w-auto min-w-[150px]"
        :aria-label="t('admin.condition.combinator')"
        @update:model-value="(v) => update({ combinator: v as 'all' | 'any' })"
      />
      <USwitch
        :model-value="group.negate"
        size="sm"
        :label="t('admin.condition.negate')"
        @update:model-value="(v: boolean) => update({ negate: v })"
      />
      <UButton
        v-if="depth > 0"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        class="ms-auto"
        :aria-label="t('admin.condition.removeGroup')"
        @click="emit('remove')"
      />
    </div>

    <p v-if="!group.items.length" class="cb-empty">
      {{ depth === 0 ? t('admin.condition.emptyRoot') : t('admin.condition.emptyGroup') }}
    </p>

    <ol class="cb-items">
      <li v-for="(node, i) in group.items" :key="i">
        <span v-if="i > 0" class="cb-join">{{ t(`admin.condition.join.${group.combinator}`) }}</span>
        <ConditionBuilder
          v-if="node.kind === 'group'"
          :model-value="node"
          :fields="fields"
          :depth="depth + 1"
          :max-depth="maxDepth"
          :variables="variables"
          @update:model-value="(g: BuilderGroup) => setItem(i, g)"
          @remove="removeItem(i)"
        />
        <div v-else class="cb-leaf">
          <USelectMenu
            :model-value="node.field"
            :items="fieldItems"
            value-key="value"
            size="sm"
            class="cb-field"
            :aria-label="t('admin.condition.field')"
            @update:model-value="(v: string) => changeField(i, node, v)"
          />
          <USelect
            :model-value="node.op"
            :items="opItems(node)"
            size="sm"
            class="cb-op"
            :aria-label="t('admin.condition.operator')"
            @update:model-value="(v) => changeOp(i, node, v as ConditionOp)"
          />
          <div class="cb-value">
            <template v-if="node.op === 'isNull'">
              <USelect
                :model-value="node.value === false ? 'false' : 'true'"
                :items="[
                  { value: 'true', label: t('admin.condition.isEmpty') },
                  { value: 'false', label: t('admin.condition.isNotEmpty') },
                ]"
                size="sm"
                class="w-full"
                @update:model-value="(v) => setValue(i, node, v === 'true')"
              />
            </template>
            <template v-else-if="isVariable(node.value)">
              <USelect
                :model-value="node.value.var"
                :items="
                  variables.map((v) => ({
                    value: v,
                    label: t(`admin.condition.vars.${v.replace('.', '_')}`),
                  }))
                "
                size="sm"
                icon="i-lucide-variable"
                class="flex-1"
                @update:model-value="(v) => setValue(i, node, { var: v as string })"
              />
            </template>
            <template
              v-else-if="fields[node.field]?.type === 'enum' && (node.op === 'in' || node.op === 'nin')"
            >
              <USelectMenu
                :model-value="(node.value as string[]) ?? []"
                :items="[...(fields[node.field]?.values ?? [])]"
                multiple
                size="sm"
                class="w-full"
                :placeholder="t('admin.condition.pickValues')"
                @update:model-value="(v: string[]) => setValue(i, node, v)"
              />
            </template>
            <template v-else-if="fields[node.field]?.type === 'enum'">
              <USelect
                :model-value="node.value as string"
                :items="[...(fields[node.field]?.values ?? [])]"
                size="sm"
                class="w-full"
                @update:model-value="(v) => setValue(i, node, v as string)"
              />
            </template>
            <template v-else-if="fields[node.field]?.type === 'boolean'">
              <USelect
                :model-value="String(node.value)"
                :items="[
                  { value: 'true', label: t('admin.condition.true') },
                  { value: 'false', label: t('admin.condition.false') },
                ]"
                size="sm"
                class="w-full"
                @update:model-value="(v) => setValue(i, node, v === 'true')"
              />
            </template>
            <template v-else-if="node.op === 'between'">
              <UInput
                v-for="side in [0, 1]"
                :key="side"
                :model-value="String((node.value as unknown[])?.[side] ?? '')"
                :type="inputType(node)"
                size="sm"
                class="flex-1"
                :aria-label="side === 0 ? t('admin.condition.from') : t('admin.condition.to')"
                @update:model-value="
                  (v) => {
                    const next = [...((node.value as never[]) ?? ['', ''])]
                    next[side] = parseInput(fields[node.field], String(v)) as never
                    setValue(i, node, next)
                  }
                "
              />
            </template>
            <template v-else-if="node.op === 'in' || node.op === 'nin'">
              <UInput
                :model-value="listText(node.value)"
                size="sm"
                class="w-full"
                :placeholder="t('admin.condition.listHint')"
                @update:model-value="(v) => setValue(i, node, parseList(node, String(v)))"
              />
            </template>
            <template v-else>
              <UInput
                :model-value="String(node.value ?? '')"
                :type="inputType(node)"
                size="sm"
                class="flex-1"
                :aria-label="t('admin.condition.value')"
                @update:model-value="(v) => setValue(i, node, parseInput(fields[node.field], String(v)))"
              />
            </template>
            <UTooltip v-if="canUseVar(node)" :text="t('admin.condition.useVariable')">
              <UButton
                size="sm"
                :color="isVariable(node.value) ? 'primary' : 'neutral'"
                :variant="isVariable(node.value) ? 'soft' : 'ghost'"
                icon="i-lucide-variable"
                :aria-pressed="isVariable(node.value)"
                :aria-label="t('admin.condition.useVariable')"
                @click="setValue(i, node, isVariable(node.value) ? '' : { var: variables[0]! })"
              />
            </UTooltip>
          </div>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :aria-label="t('admin.condition.removeRule')"
            @click="removeItem(i)"
          />
        </div>
      </li>
    </ol>

    <div class="cb-add">
      <UButton
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        :disabled="!fieldItems.length"
        @click="addLeaf"
      >
        {{ t('admin.condition.addRule') }}
      </UButton>
      <UButton
        v-if="depth < maxDepth - 1"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-brackets"
        :disabled="!fieldItems.length"
        @click="addGroup"
      >
        {{ t('admin.condition.addGroup') }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.cb {
  display: grid;
  gap: 10px;
}
.cb.nested {
  padding: 10px 12px;
  border: 1px dashed var(--app-border);
  border-radius: var(--app-r-md);
  background: color-mix(in oklab, var(--app-surface-2) 60%, transparent);
}
.cb.negated {
  border-color: color-mix(in oklab, var(--app-bad) 40%, var(--app-border));
}
.cb-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}
.cb-empty {
  color: var(--app-muted);
  font-size: 12.5px;
}
.cb-items {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cb-join {
  display: block;
  margin: 2px 0 6px;
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
:global(html:lang(lo)) .cb-join {
  letter-spacing: 0;
  text-transform: none;
}
.cb-leaf {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(110px, 0.8fr) minmax(150px, 1.4fr) auto;
  gap: 6px;
  align-items: center;
}
.cb-value {
  display: flex;
  min-width: 0;
  gap: 6px;
}
.cb-add {
  display: flex;
  gap: 6px;
}
@media (max-width: 640px) {
  .cb-leaf {
    grid-template-columns: 1fr 1fr auto;
  }
  .cb-value {
    grid-column: 1 / -2;
    grid-row: 2;
  }
}
</style>

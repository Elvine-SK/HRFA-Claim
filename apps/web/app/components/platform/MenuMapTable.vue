<script setup lang="ts">
import type { MenuMapRow } from '@elvine-sk/platform-nuxt/utils'

// The menu map as indented rows: route, source, the permission each item needs and, once a role or user
// is chosen, what they get and why not.
const props = defineProps<{
  rows: MenuMapRow[]
  groupLabels: Record<string, string>
  /** A role or user is chosen and the server answered. */
  judged: boolean
  onlyHidden?: boolean
  /** One row on its own (the diagram's details): no section headings. */
  flat?: boolean
}>()

const { t, te } = useI18n()
const label = (text: string) => (te(text) ? t(text) : text)
const shown = computed(() => props.rows.filter((r) => !props.onlyHidden || r.state === 'hidden'))
const groups = computed(() => [...new Set(shown.value.map((r) => r.group))])
const sourceOf = (row: MenuMapRow) => {
  const source = row.item.source ?? 'web'
  return source.startsWith('api:') ? `api · ${source.slice(4)}` : source
}
const needs = (row: MenuMapRow) => {
  const spec = row.item.permission
  if (!spec) return ''
  if (typeof spec === 'string') return spec
  if (Array.isArray(spec)) return spec.join(' | ')
  const { anyOf = [], allOf = [] } = spec as { anyOf?: readonly string[]; allOf?: readonly string[] }
  return [anyOf.join(' | '), allOf.join(' + ')].filter(Boolean).join(' · ')
}
const why = (row: MenuMapRow) => {
  const r = row.reason
  if (!r) return ''
  if (!r.missing.length) return t('admin.menuMap.noChildren')
  const parts = [t('admin.menuMap.missing', { keys: r.missing.join(', ') })]
  if (r.grantedBy.length) parts.push(t('admin.menuMap.grantedBy', { roles: r.grantedBy.join(', ') }))
  if (r.otherRoles) parts.push(t('admin.menuMap.otherRoles', { n: r.otherRoles }))
  if (!r.grantedBy.length && !r.otherRoles) parts.push(t('admin.menuMap.noRole'))
  return parts.join(' · ')
}
</script>

<template>
  <div class="mmt-wrap">
    <table class="mmt">
      <thead>
        <tr>
          <th>{{ t('admin.menuMap.columns.item') }}</th>
          <th>{{ t('admin.menuMap.columns.route') }}</th>
          <th>{{ t('admin.menuMap.columns.source') }}</th>
          <th>{{ t('admin.menuMap.columns.needs') }}</th>
          <th v-if="judged">{{ t('admin.menuMap.columns.result') }}</th>
        </tr>
      </thead>
      <tbody v-for="group in groups" :key="group">
        <tr v-if="!flat" class="mmt-g">
          <td :colspan="judged ? 5 : 4">{{ label(groupLabels[group] ?? group) }}</td>
        </tr>
        <tr
          v-for="row in shown.filter((r) => r.group === group)"
          :key="row.item.id"
          :class="{ off: judged && row.state === 'hidden' }"
          :data-item="row.item.id"
        >
          <td :style="{ paddingLeft: `${10 + (row.depth - 1) * 20}px` }">
            <UIcon v-if="row.item.icon" :name="row.item.icon" class="mmt-ico" />
            {{ label(row.item.label) }}
          </td>
          <td class="mono">
            <span v-if="row.item.to">{{ row.item.to }}</span>
            <span v-else class="muted">{{ t('admin.menuMap.opensOnly') }}</span>
          </td>
          <td>
            <span class="mmt-src mono">{{ sourceOf(row) }}</span>
          </td>
          <td class="mono">
            <span v-if="needs(row)" class="mmt-perm">{{ needs(row) }}</span>
            <span v-else class="muted">{{ t('admin.menuMap.anyone') }}</span>
          </td>
          <td v-if="judged">
            <span :class="`mmt-state ${row.state}`">{{ t(`admin.menuMap.state.${row.state}`) }}</span>
            <span v-if="row.state === 'hidden'" class="mmt-why">{{ why(row) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.mmt-wrap {
  overflow-x: auto;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: var(--app-surface);
}
.mmt {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.mmt th {
  padding: 8px 10px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}
.mmt td {
  padding: 7px 10px;
  border-bottom: 1px solid color-mix(in oklab, var(--app-border) 60%, transparent);
  vertical-align: middle;
}
.mmt-g td {
  background: var(--app-surface-2);
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
tr.off td {
  color: var(--app-muted);
}
.mmt-ico {
  width: 15px;
  height: 15px;
  margin-right: 6px;
  vertical-align: -2px;
}
.muted {
  color: var(--app-muted);
}
.mmt-src {
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--app-surface-2);
  font-size: 11px;
}
.mmt-perm {
  color: var(--app-accent);
  font-size: 12px;
}
.mmt-state {
  font-weight: 600;
  white-space: nowrap;
}
.mmt-state.link {
  color: var(--ui-success);
}
.mmt-state.toggle {
  color: var(--ui-warning);
}
.mmt-state.hidden {
  color: var(--ui-error);
}
.mmt-why {
  display: block;
  color: var(--app-muted);
  font-size: 12px;
}
</style>

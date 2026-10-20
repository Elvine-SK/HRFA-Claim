<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { AuthzCatalog, RoleDetail } from '../../../types/platform'

const props = defineProps<{
  catalog: AuthzCatalog
  roles: RoleDetail[]
  /** Working copy: role id → granted permission keys. */
  draft: Record<string, string[]>
  editable: boolean
}>()
const emit = defineEmits<{
  toggle: [roleId: string, key: string]
  /** Grant or revoke several keys at once (a resource row's aggregate). */
  setMany: [roleId: string, keys: string[], on: boolean]
  open: [roleId: string]
}>()
const { t, te } = useI18n()
// Under 720 px the grid doesn't fit: one role at a time, as switches.
const isMobile = useMediaQuery('(max-width: 720px)')

const search = ref('')
const collapsed = ref(new Set<string>())

const label = (text: string) => (te(text) ? t(text) : text)
const resources = computed(() => {
  const q = search.value.trim().toLowerCase()
  // A module's own label wins; platform resources are named in the locale files.
  const named = new Map(props.catalog.resources.map((r) => [r.resource, r.label]))
  const labels = new Map(
    props.catalog.permissions.map((p) => [
      p.resource,
      label(named.get(p.resource) ?? `admin.roles.resources.${p.resource}`).replace(
        /^admin\.roles\.resources\./,
        '',
      ),
    ]),
  )
  const byResource = new Map<string, string[]>()
  for (const p of props.catalog.permissions) {
    if (q && !p.key.includes(q) && !(labels.get(p.resource) ?? '').toLowerCase().includes(q)) continue
    byResource.set(p.resource, [...(byResource.get(p.resource) ?? []), p.action])
  }
  return [...byResource]
    .map(([resource, actions]) => ({ resource, label: labels.get(resource) ?? resource, actions }))
    .sort((a, b) => a.resource.localeCompare(b.resource))
})

const original = computed(() => new Map(props.roles.map((r) => [r.id, new Set(r.permissions)])))
const draftSets = computed(
  () => new Map(Object.entries(props.draft).map(([id, keys]) => [id, new Set(keys)])),
)

function policiesFor(role: RoleDetail, resource: string, action: string) {
  return role.policies.filter((p) => p.resource === resource && p.actions.includes(action))
}

function state(role: RoleDetail, key: string, resource: string, action: string) {
  if (role.isSuper) return 'super'
  if (draftSets.value.get(role.id)?.has(key)) return 'on'
  if (policiesFor(role, resource, action).some((p) => p.effect === 'allow')) return 'cond'
  return 'off'
}
const changed = (role: RoleDetail, key: string) =>
  !role.isSuper &&
  (original.value.get(role.id)?.has(key) ?? false) !== (draftSets.value.get(role.id)?.has(key) ?? false)

function toggleGroup(resource: string) {
  const next = new Set(collapsed.value)
  if (next.has(resource)) next.delete(resource)
  else next.add(resource)
  collapsed.value = next
}

const widgets = useWidgetRegistry()
// A `widget.<id>` action is a dashboard widget: show its name, not its id.
const actionLabel = (resource: string, action: string) => {
  const widget = resource === 'widget' ? widgets.get(action) : undefined
  if (widget) return t(widget.title)
  return te(`admin.roles.actions.${action}`) ? t(`admin.roles.actions.${action}`) : action
}
/** Who holds the role, for the column header. */
function reachText(role: RoleDetail) {
  const { users, groups } = role.reach
  const parts = [t('admin.roles.review.users', { n: users }, users)]
  if (groups) parts.push(t('admin.roles.review.groups', { n: groups }, groups))
  return parts.join(' · ')
}

function cellLabel(role: RoleDetail, key: string, st: string) {
  return `${role.name} · ${key}: ${t(`admin.roles.matrix.${st}`)}`
}

const keysOf = (res: { resource: string; actions: string[] }) =>
  res.actions.map((a) => `${res.resource}.${a}`)
function aggregate(role: RoleDetail, res: { resource: string; actions: string[] }) {
  const keys = keysOf(res)
  const granted = keys.filter((k) => draftSets.value.get(role.id)?.has(k)).length
  return { keys, granted, total: keys.length, state: aggregateState(granted, keys.length) }
}

// Roving tabindex: one cell is in the tab order; arrow keys, Home and End move between cells.
const grid = ref<HTMLElement>()
const rowOf = computed(() => {
  const keys = resources.value.flatMap((res) => (collapsed.value.has(res.resource) ? [] : keysOf(res)))
  return new Map(keys.map((key, i) => [key, i]))
})
const focused = ref({ row: 0, col: 0 })
const active = computed(() => ({
  row: Math.min(focused.value.row, Math.max(rowOf.value.size - 1, 0)),
  col: Math.min(focused.value.col, Math.max(props.roles.length - 1, 0)),
}))
function onGridKey(event: KeyboardEvent) {
  const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-r]')
  if (!cell) return
  const next = moveCell({ row: Number(cell.dataset.r), col: Number(cell.dataset.c) }, event.key, {
    rows: rowOf.value.size,
    cols: props.roles.length,
  })
  if (!next) return
  event.preventDefault()
  focused.value = next
  grid.value?.querySelector<HTMLElement>(`[data-r="${next.row}"][data-c="${next.col}"]`)?.focus()
}

const mobileRoleId = ref<string>()
const mobileRole = computed(() => props.roles.find((r) => r.id === mobileRoleId.value) ?? props.roles[0])
</script>

<template>
  <div>
    <div class="ac-tools">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('admin.roles.matrix.search')"
        class="w-[300px] max-w-full"
      />
      <div class="ac-legend" aria-hidden="true">
        <span><i class="ac-dot on" />{{ t('admin.roles.matrix.on') }}</span>
        <span><i class="ac-dot cond" />{{ t('admin.roles.matrix.cond') }}</span>
        <span><i class="ac-dot" />{{ t('admin.roles.matrix.off') }}</span>
        <span><UIcon name="i-lucide-crown" class="size-3.5" />{{ t('admin.roles.matrix.super') }}</span>
        <span><i class="ac-mk">P</i>{{ t('admin.roles.matrix.allowPolicy') }}</span>
        <span
          ><i class="ac-mk deny"><UIcon name="i-lucide-circle-slash" class="size-3.5" /></i
          >{{ t('admin.roles.matrix.denyPolicy') }}</span
        >
        <span>
          <UIcon name="i-lucide-triangle-alert" class="ac-sens" />{{ t('admin.roles.matrix.sensitive') }}
        </span>
      </div>
    </div>
    <div v-if="isMobile && mobileRole" class="ac-mob" data-testid="access-mobile">
      <USelect
        :model-value="mobileRole.id"
        :items="roles.map((r) => ({ value: r.id, label: r.name }))"
        icon="i-lucide-shield-check"
        class="w-full"
        :aria-label="t('admin.roles.matrix.role')"
        @update:model-value="(id: string) => (mobileRoleId = id)"
      />
      <p v-if="mobileRole.isSuper" class="ac-mnote">
        <UIcon name="i-lucide-crown" class="size-4 text-[var(--app-warn)]" />
        {{ t('admin.roles.matrix.superAll') }}
      </p>
      <template v-else>
        <section v-for="res in resources" :key="res.resource" class="ac-mres">
          <h3>
            {{ res.label }}
            <small class="mono">{{ aggregate(mobileRole, res).granted }}/{{ res.actions.length }}</small>
          </h3>
          <div
            v-for="action in res.actions"
            :key="action"
            class="ac-mrow"
            :class="{ chg: changed(mobileRole, `${res.resource}.${action}`) }"
          >
            <span>
              <span class="mono text-[12.5px]">{{ action }}</span>
              <small v-if="state(mobileRole, `${res.resource}.${action}`, res.resource, action) === 'cond'">
                {{ t('admin.roles.matrix.cond') }}
              </small>
            </span>
            <USwitch
              :model-value="state(mobileRole, `${res.resource}.${action}`, res.resource, action) === 'on'"
              :disabled="!editable"
              :aria-label="`${mobileRole.name} · ${res.resource}.${action}`"
              @update:model-value="emit('toggle', mobileRole.id, `${res.resource}.${action}`)"
            />
          </div>
        </section>
        <PlatformEmptyState
          v-if="!resources.length"
          kind="no-results"
          :title="t('admin.roles.matrix.noMatch')"
          class="py-10"
        />
      </template>
    </div>
    <div v-else ref="grid" class="ac-wrap" @keydown="onGridKey">
      <table class="ac-grid">
        <caption class="sr-only">
          {{
            t('admin.roles.matrix.caption')
          }}
        </caption>
        <thead>
          <tr>
            <th class="ac-corner" scope="col">{{ t('admin.roles.matrix.permission') }}</th>
            <th v-for="role in roles" :key="role.id" scope="col" class="ac-rh">
              <button type="button" class="ac-rh-t" @click="emit('open', role.id)">
                <UIcon v-if="role.isSuper" name="i-lucide-crown" class="size-3.5 text-[var(--app-warn)]" />
                <b>{{ role.name }}</b>
              </button>
              <small>{{ reachText(role) }}</small>
            </th>
          </tr>
        </thead>
        <tbody v-for="res in resources" :key="res.resource">
          <tr class="ac-res">
            <th scope="rowgroup">
              <button
                type="button"
                class="ac-rt"
                :aria-expanded="!collapsed.has(res.resource)"
                @click="toggleGroup(res.resource)"
              >
                <UIcon name="i-lucide-chevron-down" class="ico" />
                <b>{{ res.label }}</b>
                <small class="mono">{{ res.resource }}</small>
              </button>
            </th>
            <td v-for="role in roles" :key="role.id" class="ac-td">
              <span v-if="role.isSuper" class="ac-all">{{ t('admin.roles.matrix.all') }}</span>
              <button
                v-else
                type="button"
                class="ac-agg"
                :data-st="aggregate(role, res).state"
                :aria-disabled="!editable || undefined"
                :aria-label="
                  t('admin.roles.matrix.aggregate', {
                    role: role.name,
                    resource: res.label,
                    n: aggregate(role, res).granted,
                    total: aggregate(role, res).total,
                  })
                "
                @click="
                  editable &&
                  emit('setMany', role.id, aggregate(role, res).keys, aggregate(role, res).state !== 'all')
                "
              >
                <i />
                <span class="mono">{{ aggregate(role, res).granted }}/{{ aggregate(role, res).total }}</span>
              </button>
            </td>
          </tr>
          <template v-if="!collapsed.has(res.resource)">
            <tr v-for="action in res.actions" :key="action" class="ac-act">
              <th scope="row">
                <span class="text-[13px]">{{ actionLabel(res.resource, action) }}</span>
                <small class="mono">{{ res.resource }}.{{ action }}</small>
                <UTooltip
                  v-if="isSensitivePermission(`${res.resource}.${action}`)"
                  :text="t('admin.roles.matrix.sensitiveTip')"
                >
                  <UIcon name="i-lucide-triangle-alert" class="ac-sens ms-1.5" />
                </UTooltip>
              </th>
              <td
                v-for="(role, ci) in roles"
                :key="role.id"
                class="ac-td"
                :class="{ chg: changed(role, `${res.resource}.${action}`) }"
              >
                <div class="ac-cw">
                  <button
                    type="button"
                    class="ac-c"
                    :data-r="rowOf.get(`${res.resource}.${action}`)"
                    :data-c="ci"
                    :tabindex="
                      rowOf.get(`${res.resource}.${action}`) === active.row && ci === active.col ? 0 : -1
                    "
                    @focus="focused = { row: rowOf.get(`${res.resource}.${action}`) ?? 0, col: ci }"
                    :data-st="state(role, `${res.resource}.${action}`, res.resource, action)"
                    :aria-pressed="state(role, `${res.resource}.${action}`, res.resource, action) === 'on'"
                    :aria-disabled="!editable || role.isSuper || undefined"
                    :aria-label="
                      cellLabel(
                        role,
                        `${res.resource}.${action}`,
                        state(role, `${res.resource}.${action}`, res.resource, action),
                      )
                    "
                    @click="editable && !role.isSuper && emit('toggle', role.id, `${res.resource}.${action}`)"
                  >
                    <UIcon
                      v-if="state(role, `${res.resource}.${action}`, res.resource, action) === 'on'"
                      name="i-lucide-check"
                      class="size-3.5 text-white"
                    />
                    <UIcon
                      v-else-if="role.isSuper"
                      name="i-lucide-crown"
                      class="size-3.5 text-[var(--app-warn)]"
                    />
                  </button>
                  <span v-if="policiesFor(role, res.resource, action).length && !role.isSuper" class="ac-mks">
                    <UTooltip
                      v-for="p in policiesFor(role, res.resource, action)"
                      :key="p.id"
                      :text="`${t(`admin.roles.policy.${p.effect}`)}: ${p.name}`"
                    >
                      <button
                        type="button"
                        class="ac-mk"
                        :class="{ deny: p.effect === 'deny' }"
                        @click="emit('open', role.id)"
                      >
                        <UIcon v-if="p.effect === 'deny'" name="i-lucide-circle-slash" class="size-3.5" />
                        <template v-else>P</template>
                      </button>
                    </UTooltip>
                  </span>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <PlatformEmptyState
        v-if="!resources.length"
        kind="no-results"
        :title="t('admin.roles.matrix.noMatch')"
        class="py-10"
      />
    </div>
    <p v-if="editable && !isMobile" class="ac-hint">
      <UIcon name="i-lucide-keyboard" class="size-4" />{{ t('admin.roles.matrix.hint') }}
    </p>
  </div>
</template>

<style scoped>
.ac-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 14px var(--app-pad, 20px) 12px;
}
.ac-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  color: var(--app-muted);
  font-size: 12px;
}
.ac-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ac-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1.5px solid color-mix(in oklab, var(--app-muted) 45%, transparent);
  border-radius: 50%;
}
.ac-dot.on {
  border-color: var(--app-accent);
  background: var(--app-accent);
}
.ac-dot.cond {
  border: 1.5px dashed var(--app-chart-3);
  background: color-mix(in oklab, var(--app-chart-3) 22%, transparent);
}
.ac-wrap {
  max-height: calc(100vh - 260px);
  overflow: auto;
  border-top: 1px solid var(--app-border);
}
.ac-grid {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}
.ac-grid th,
.ac-grid td {
  padding: 0;
  border-bottom: 1px solid var(--app-border);
}
.ac-grid thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 10px 8px;
  background: var(--app-surface-2);
  font-weight: 500;
  text-align: start;
  vertical-align: bottom;
}
.ac-grid tbody th {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 220px;
  border-right: 1px solid var(--app-border);
  background: var(--app-surface);
  font-weight: 500;
  text-align: start;
}
.ac-grid thead th.ac-corner {
  left: 0;
  z-index: 3;
  min-width: 220px;
  padding-inline-start: var(--app-pad, 20px);
  border-right: 1px solid var(--app-border);
  color: var(--app-muted);
  font-size: 11.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
:global(html:lang(lo)) .ac-grid thead th.ac-corner {
  letter-spacing: 0;
  text-transform: none;
}
.ac-rh {
  min-width: 118px;
  text-align: center !important;
}
.ac-rh-t {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 0;
  background: none;
  color: var(--app-text);
  cursor: pointer;
}
.ac-rh-t:hover b {
  color: var(--app-accent);
}
.ac-rh-t b {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.ac-rh small {
  display: block;
  margin-top: 1px;
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 400;
  text-align: center;
  white-space: nowrap;
}
.ac-res th {
  background: var(--app-surface-2) !important;
}
.ac-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px var(--app-pad, 20px);
  border-top: 1px solid var(--app-border);
  color: var(--app-muted);
  font-size: 12px;
}
.ac-res td {
  background: var(--app-surface-2);
}
.ac-all {
  color: var(--app-muted);
  font-size: 12px;
}
.ac-agg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--app-muted);
  font-size: 11.5px;
  cursor: pointer;
}
.ac-agg:hover {
  background: color-mix(in oklab, var(--app-accent) 10%, transparent);
  color: var(--app-text);
}
.ac-agg[aria-disabled] {
  cursor: default;
}
.ac-agg[aria-disabled]:hover {
  background: none;
  color: var(--app-muted);
}
.ac-agg i {
  width: 10px;
  height: 10px;
  border: 1.5px solid color-mix(in oklab, var(--app-muted) 45%, transparent);
  border-radius: 50%;
}
.ac-agg[data-st='all'] i {
  border-color: var(--app-accent);
  background: var(--app-accent);
}
.ac-agg[data-st='some'] i {
  border-color: var(--app-accent);
  background: linear-gradient(90deg, var(--app-accent) 50%, transparent 50%);
}
.ac-mob {
  display: grid;
  gap: 14px;
  padding: 4px var(--app-pad, 20px) 16px;
}
.ac-mnote {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-muted);
  font-size: 13px;
}
.ac-mres h3 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 600;
}
.ac-mres h3 small {
  color: var(--app-muted);
  font-size: 11.5px;
  font-weight: 400;
}
.ac-mrow {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 8px;
  border-top: 1px solid var(--app-border);
}
.ac-mrow.chg {
  background: color-mix(in oklab, var(--app-accent) 10%, transparent);
}
.ac-mrow small {
  display: block;
  color: var(--app-muted);
  font-size: 11.5px;
}
.ac-c:focus-visible,
.ac-agg:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.ac-rt {
  display: flex;
  width: 100%;
  height: 42px;
  align-items: center;
  gap: 8px;
  padding: 0 12px 0 calc(var(--app-pad, 20px) - 6px);
  border: 0;
  background: none;
  color: var(--app-text);
  cursor: pointer;
  text-align: start;
}
.ac-rt .ico {
  width: 16px;
  color: var(--app-muted);
  transition: transform var(--app-dur-base);
}
.ac-rt[aria-expanded='false'] .ico {
  transform: rotate(-90deg);
}
.ac-rt small,
.ac-act th small {
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 400;
}
.ac-act th {
  height: 40px;
  padding: 0 12px 0 calc(var(--app-pad, 20px) + 22px) !important;
  white-space: nowrap;
}
.ac-act th > span:first-child {
  margin-inline-end: 8px;
}
.ac-td {
  height: 40px;
  text-align: center;
}
.ac-td.chg {
  background: color-mix(in oklab, var(--app-accent) 10%, transparent);
}
.ac-cw {
  position: relative;
  display: flex;
  height: 40px;
  align-items: center;
  justify-content: center;
}
.ac-c {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  padding: 0;
  border: 1.5px solid color-mix(in oklab, var(--app-muted) 45%, transparent);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition:
    transform 0.1s,
    background-color var(--app-dur-base),
    border-color var(--app-dur-base);
}
.ac-c:hover {
  border-color: var(--app-accent);
  transform: scale(1.12);
}
.ac-c[data-st='on'] {
  border-color: var(--app-accent);
  background: var(--app-accent);
}
.ac-c[data-st='cond'] {
  border-style: dashed;
  border-color: var(--app-chart-3);
  background: color-mix(in oklab, var(--app-chart-3) 22%, transparent);
}
.ac-c[data-st='super'] {
  border: 0;
  background: none;
  cursor: default;
}
.ac-c[aria-disabled] {
  cursor: default;
}
.ac-c[aria-disabled]:hover {
  transform: none;
}
.ac-td.chg .ac-c {
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--app-accent) 30%, transparent);
}
.ac-mks {
  position: absolute;
  top: 50%;
  left: calc(50% + 15px);
  display: flex;
  gap: 2px;
  transform: translateY(-50%);
}
.ac-mk {
  display: inline-grid;
  min-width: 17px;
  height: 18px;
  place-items: center;
  padding: 0 3px;
  border: 0;
  border-radius: 5px;
  background: color-mix(in oklab, var(--app-chart-3) 15%, transparent);
  color: color-mix(in oklab, var(--app-chart-3) 70%, var(--app-text));
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.ac-legend .ac-mk {
  font-style: normal;
  cursor: default;
}
.ac-sens {
  width: 13px;
  height: 13px;
  color: var(--app-warn);
  vertical-align: -2px;
}
.ac-mk.deny {
  background: color-mix(in oklab, var(--app-bad) 13%, transparent);
  color: color-mix(in oklab, var(--app-bad) 80%, var(--app-text));
}
</style>

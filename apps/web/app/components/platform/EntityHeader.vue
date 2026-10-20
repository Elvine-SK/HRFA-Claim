<script setup lang="ts">
export interface EntityTab {
  value: string
  label: string
  count?: number
}

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: string
    loading?: boolean
    meta?: { label: string; value?: string | number | null }[]
    tabs?: EntityTab[]
  }>(),
  { subtitle: undefined, icon: 'i-lucide-file-text', loading: false, meta: () => [], tabs: () => [] },
)
const tab = defineModel<string>('tab')
</script>

<template>
  <section class="prof">
    <div class="band" aria-hidden="true" />
    <div class="main">
      <span class="tile" aria-hidden="true"><UIcon :name="icon" class="size-10" /></span>
      <div class="ident">
        <USkeleton v-if="loading" class="h-7 w-64" />
        <h1 v-else>
          {{ title }}
          <slot name="badges" />
        </h1>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="acts"><slot name="actions" /></div>
    </div>
    <dl v-if="meta.length" class="meta">
      <div v-for="item in meta" :key="item.label">
        <dt>{{ item.label }}</dt>
        <dd>
          <slot :name="`meta-${item.label}`">{{ item.value ?? '—' }}</slot>
        </dd>
      </div>
    </dl>
    <UTabs
      v-if="tabs.length"
      v-model="tab"
      :items="tabs.map((t) => ({ label: t.label, value: t.value, badge: t.count }))"
      :content="false"
      variant="link"
      :ui="{ root: 'border-t border-default px-[calc(var(--app-pad)-12px)]', list: 'border-b-0' }"
    />
  </section>
</template>

<style scoped>
.prof {
  overflow: hidden;
  margin-bottom: var(--app-gap);
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-lg);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}
.band {
  position: relative;
  height: 110px;
  overflow: hidden;
  background: var(--app-grad);
}
.band::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgb(255 255 255 / 0.25) 1px, transparent 1px);
  background-size: 16px 16px;
  mask-image: linear-gradient(90deg, transparent, #000);
}
.main {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 18px;
  margin-top: -44px;
  padding: 0 var(--app-pad);
}
.tile {
  display: grid;
  width: 96px;
  height: 96px;
  flex: none;
  place-items: center;
  border: 5px solid var(--app-surface);
  border-radius: var(--app-r-lg);
  background: color-mix(in oklab, var(--app-accent) 14%, var(--app-surface));
  box-shadow: var(--app-shadow);
  color: var(--app-accent);
}
.ident {
  min-width: 220px;
  flex: 1;
  padding-bottom: 4px;
}
.ident h1 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}
.ident p {
  margin-top: 3px;
  color: var(--app-muted);
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 6px;
}
.meta {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin: 0;
  padding: 18px var(--app-pad);
}
.meta dt {
  margin-bottom: 4px;
  color: var(--app-muted);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.meta dd {
  overflow: hidden;
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 1280px) {
  .meta {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

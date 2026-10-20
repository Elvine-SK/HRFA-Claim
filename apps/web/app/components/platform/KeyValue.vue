<script setup lang="ts">
defineProps<{ items: { label: string; value?: string | number | null; key?: string }[] }>()
</script>

<template>
  <dl class="kv">
    <template v-for="item in items" :key="item.key ?? item.label">
      <dt>{{ item.label }}</dt>
      <dd>
        <slot :name="item.key ?? item.label" :item="item">{{ item.value ?? '—' }}</slot>
      </dd>
    </template>
  </dl>
</template>

<style scoped>
.kv {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 9px 12px;
  margin: 0;
  font-size: 13px;
}
dt {
  color: var(--app-muted);
}
dd {
  min-width: 0;
  margin: 0;
  font-weight: 500;
  overflow-wrap: anywhere;
}
</style>

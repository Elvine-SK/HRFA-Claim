<script setup lang="ts">
/** A plain, scrollable table for the small reference tables of the master data screens. */
defineProps<{ caption: string }>()
</script>

<template>
  <div class="mt-wrap">
    <table class="mt-table">
      <caption class="sr-only">
        {{ caption }}
      </caption>
      <slot />
    </table>
  </div>
</template>

<style scoped>
.mt-wrap {
  overflow-x: auto;
}
.mt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.mt-table :deep(th) {
  padding: 8px 12px;
  text-align: start;
  font-weight: 500;
  white-space: nowrap;
  color: var(--ui-text-muted);
  border-bottom: 1px solid var(--ui-border);
}
.mt-table :deep(td) {
  padding: 8px 12px;
  vertical-align: middle;
  border-bottom: 1px solid var(--ui-border);
}
.mt-table :deep(.mt-num) {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
</style>

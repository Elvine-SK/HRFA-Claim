<script setup lang="ts">
defineProps<{ title: string; eyebrow?: string; subtitle?: string; eyebrowIcon?: string }>()
</script>

<template>
  <header class="ph">
    <div class="min-w-0">
      <p v-if="eyebrow" class="eyebrow mono">
        <UIcon v-if="eyebrowIcon" :name="eyebrowIcon" class="size-3.5" />
        {{ eyebrow }}
      </p>
      <h1>
        <slot name="title">{{ title }}</slot>
      </h1>
      <p v-if="subtitle || $slots.subtitle" class="sub">
        <slot name="subtitle">{{ subtitle }}</slot>
      </p>
    </div>
    <div v-if="$slots.actions" class="ph-act">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.ph {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin: 4px 0 20px;
}
.ph h1 {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.15;
}
.sub {
  margin-top: 6px;
  color: var(--app-muted);
}
.sub :deep(b) {
  color: var(--app-text);
  font-weight: 600;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--app-accent);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ph-act {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
@media (max-width: 640px) {
  .ph-act {
    width: 100%;
  }
  .ph-act > :deep(*) {
    flex: 1;
    justify-content: center;
  }
}
</style>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  icon?: string
  tone?: 'accent' | 'ok' | 'warn' | 'bad' | 'info'
  back?: { to: string; label: string }
  error?: string | null
}>()
</script>

<template>
  <section class="panel">
    <NuxtLink v-if="back" :to="back.to" class="back">
      <UIcon name="i-lucide-arrow-left" class="size-4 rtl:rotate-180" />
      {{ back.label }}
    </NuxtLink>
    <div
      v-if="icon"
      class="ic-hero"
      :style="tone && tone !== 'accent' ? { '--k': `var(--app-${tone})` } : undefined"
      aria-hidden="true"
    >
      <UIcon :name="icon" class="size-6" />
    </div>
    <h1>{{ title }}</h1>
    <p v-if="subtitle || $slots.subtitle" class="sub">
      <slot name="subtitle">{{ subtitle }}</slot>
    </p>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error"
      class="mb-4"
      role="alert"
    />
    <slot />
    <div v-if="$slots.alt" class="alt"><slot name="alt" /></div>
  </section>
</template>

<style scoped>
.panel h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.2;
}
:global(html:lang(lo)) .panel h1 {
  letter-spacing: 0;
  line-height: 1.5;
}
.sub {
  margin: 8px 0 24px;
  color: var(--app-muted);
  line-height: 1.6;
}
.sub :deep(b) {
  color: var(--app-text);
}
.back {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 6px;
  margin-bottom: 26px;
  color: var(--app-muted);
  font-size: 13px;
  text-decoration: none;
}
.back:hover {
  color: var(--app-text);
}
.ic-hero {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  margin-bottom: 20px;
  border-radius: 16px;
  background: color-mix(in oklab, var(--k, var(--app-accent)) 13%, transparent);
  color: var(--k, var(--app-accent));
}
.alt {
  margin-top: 18px;
  color: var(--app-muted);
  font-size: 13px;
}
.alt :deep(a) {
  color: var(--app-accent);
  font-weight: 600;
  text-decoration: none;
}
.alt :deep(a:hover) {
  text-decoration: underline;
}
</style>

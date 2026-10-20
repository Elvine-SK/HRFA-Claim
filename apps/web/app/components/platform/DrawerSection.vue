<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <section class="border-t border-default px-6 py-4">
    <h3 class="eyebrow mb-2.5">{{ title }}</h3>
    <slot />
  </section>
</template>

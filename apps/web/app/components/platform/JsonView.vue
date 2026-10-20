<script setup lang="ts">
const props = defineProps<{ value: unknown; maxHeight?: string }>()
const { t } = useI18n()
const text = computed(() => (props.value === undefined ? '' : JSON.stringify(props.value, null, 2)))
const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(text.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="jv">
    <UButton
      size="xs"
      color="neutral"
      variant="ghost"
      class="jv-copy"
      :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
      :aria-label="copied ? t('platform.actions.copied') : t('platform.actions.copy')"
      @click="copy"
    />
    <pre class="mono" :style="{ maxHeight: maxHeight ?? '320px' }">{{ text || 'null' }}</pre>
  </div>
</template>

<style scoped>
.jv {
  position: relative;
}
.jv-copy {
  position: absolute;
  top: 6px;
  right: 6px;
}
pre {
  overflow: auto;
  margin: 0;
  padding: 12px 40px 12px 12px;
  border-radius: var(--app-r-sm);
  background: var(--app-surface-2);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

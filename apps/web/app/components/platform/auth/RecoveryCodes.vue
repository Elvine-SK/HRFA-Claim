<script setup lang="ts">
const props = defineProps<{ codes: string[] }>()
const acknowledged = defineModel<boolean>('acknowledged', { default: false })
const { t } = useI18n()
const notify = useNotify()

const text = computed(() => props.codes.join('\n'))

async function copy() {
  await navigator.clipboard.writeText(text.value)
  notify.success(t('platform.actions.copied'))
}

function download() {
  const blob = new Blob([`${t('auth.recovery.fileHeader')}\n\n${text.value}\n`], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: 'recovery-codes.txt' })
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="rc">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="t('auth.recovery.warning')"
    />
    <ol class="codes mono" :aria-label="t('auth.recovery.title')">
      <li v-for="code in codes" :key="code">{{ code }}</li>
    </ol>
    <div class="flex flex-wrap gap-2">
      <UButton color="neutral" variant="outline" icon="i-lucide-copy" @click="copy">
        {{ t('platform.actions.copy') }}
      </UButton>
      <UButton color="neutral" variant="outline" icon="i-lucide-download" @click="download">
        {{ t('platform.actions.download') }}
      </UButton>
    </div>
    <UCheckbox v-model="acknowledged" :label="t('auth.recovery.saved')" />
  </div>
</template>

<style scoped>
.rc {
  display: grid;
  gap: 16px;
}
.codes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin: 0;
  padding: 16px 18px;
  border: 1px dashed var(--app-border);
  border-radius: var(--app-r-md);
  background: var(--app-surface-2);
  font-size: 14px;
  list-style: none;
}
</style>

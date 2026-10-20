<script setup lang="ts">
import type { FileMeta } from '../../../types/platform'

/** A raster image shown large; the image comes from `?inline=1`, which the API serves sandboxed. */
defineProps<{ file: FileMeta; src: string; downloadSrc: string }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
</script>

<template>
  <UModal v-model:open="open" :title="file.filename" :ui="{ content: 'max-w-4xl' }">
    <template #body>
      <img
        :src="src"
        :alt="file.filename"
        class="max-h-[80vh] w-full rounded-[var(--app-r-sm)] object-contain"
      />
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton
          :to="downloadSrc"
          external
          download
          color="neutral"
          variant="outline"
          icon="i-lucide-download"
          :label="t('files.download', { name: file.filename })"
        />
      </div>
    </template>
  </UModal>
</template>

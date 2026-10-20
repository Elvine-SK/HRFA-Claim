<script setup lang="ts">
import type { Tone } from '../../../utils/tone'

/**
 * The square at the start of a stored file's row. An image is its thumbnail and asks for the large preview;
 * a PDF opens in the browser's viewer in a new tab; anything else is the coloured kind badge.
 */
const props = withDefaults(
  defineProps<{
    file: { id: string; filename: string; contentType: string }
    /** False when the content can't be fetched (a record the person can no longer see). */
    available?: boolean
    small?: boolean
  }>(),
  // An absent boolean prop would read as false.
  { available: true },
)
const emit = defineEmits<{ preview: [] }>()
const { t } = useI18n()
const apiBase = useRuntimeConfig().public.platform.apiBase

const kind = computed(() => fileKind(props.file.contentType))
const inlineSrc = computed(() => `${apiBase}/files/${props.file.id}/content?inline=1`)
const sized = computed(() => (props.small ? '!size-8 !text-[9px]' : ''))
</script>

<template>
  <button
    v-if="available && isPreviewable(file.contentType)"
    type="button"
    class="file-kind file-thumb cursor-zoom-in"
    :class="sized"
    :style="{ '--k': toneVar(kind.tone as Tone) }"
    :aria-label="t('files.preview', { name: file.filename })"
    @click.stop="emit('preview')"
  >
    <img :src="inlineSrc" alt="" loading="lazy" class="size-full object-cover" />
  </button>
  <a
    v-else-if="available && isViewable(file.contentType)"
    :href="inlineSrc"
    target="_blank"
    rel="noopener"
    class="file-kind file-thumb"
    :class="sized"
    :style="{ '--k': toneVar(kind.tone as Tone) }"
    :aria-label="t('files.open', { name: file.filename })"
    :title="t('files.open', { name: file.filename })"
    @click.stop
    >{{ kind.label }}</a
  >
  <span
    v-else
    class="file-kind"
    :class="sized"
    :style="{ '--k': toneVar(kind.tone as Tone) }"
    aria-hidden="true"
    >{{ kind.label }}</span
  >
</template>

<style scoped>
.file-thumb {
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}
.file-thumb:hover,
.file-thumb:focus-visible {
  transform: scale(1.06);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--app-accent) 45%, transparent);
  outline: none;
}
</style>

<script setup lang="ts">
const props = defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  /** For what can't be undone: the confirm button stays disabled until this word is typed. */
  typeToConfirm?: string
}>()
const emit = defineEmits<{ close: [confirmed: boolean] }>()
const { t } = useI18n()

const typed = ref('')
const ready = computed(
  () => !props.typeToConfirm || typed.value.trim().toLowerCase() === props.typeToConfirm.toLowerCase(),
)
const confirmIfReady = () => ready.value && emit('close', true)
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :close="false"
    @update:open="(open: boolean) => !open && emit('close', false)"
  >
    <template v-if="typeToConfirm" #body>
      <UFormField :label="t('platform.confirm.type', { word: typeToConfirm })">
        <UInput
          v-model="typed"
          autofocus
          autocomplete="off"
          spellcheck="false"
          class="w-full"
          :placeholder="typeToConfirm"
          data-testid="confirm-word"
          @keydown.enter.prevent="confirmIfReady"
        />
      </UFormField>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" :autofocus="!typeToConfirm" @click="emit('close', false)">
        {{ t('platform.actions.cancel') }}
      </UButton>
      <UButton :color="danger ? 'error' : 'primary'" :disabled="!ready" @click="confirmIfReady">
        {{ confirmLabel ?? t('platform.actions.confirm') }}
      </UButton>
    </template>
  </UModal>
</template>

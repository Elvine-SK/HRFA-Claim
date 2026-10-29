<script setup lang="ts">
/**
 * A date typed day first (dd/mm/yyyy) whatever the browser's language, with the browser's calendar behind a
 * button. The model is `YYYY-MM-DD`, or '' while empty or not yet a real date. Replace with the platform's field
 * once it has one (proposal C5).
 */
const props = withDefaults(defineProps<{ min?: string; max?: string; disabled?: boolean; ariaLabel?: string }>(), {
  min: undefined,
  max: undefined,
  disabled: false,
  ariaLabel: undefined,
})
const model = defineModel<string>({ default: '' })
const { t } = useI18n()

const text = ref(formatDayFirst(model.value))
// The model changes from outside (another field, a reset): show it.
watch(model, (iso) => {
  if (iso !== parseDayFirst(text.value)) text.value = formatDayFirst(iso)
})

const invalid = computed(() => text.value.trim() !== '' && parseDayFirst(text.value) === null)

function onInput(value: string | number) {
  text.value = String(value)
  model.value = parseDayFirst(text.value) ?? ''
}

function onBlur() {
  const iso = parseDayFirst(text.value)
  if (iso) text.value = formatDayFirst(iso)
}

const picker = useTemplateRef<HTMLInputElement>('picker')
function openPicker() {
  const el = picker.value
  if (!el) return
  try {
    el.showPicker()
  } catch {
    el.focus()
  }
}
function onPicked(event: Event) {
  const iso = (event.target as HTMLInputElement).value
  model.value = iso
  text.value = formatDayFirst(iso)
}
</script>

<template>
  <div class="relative">
    <UInput
      :model-value="text"
      class="w-full"
      inputmode="numeric"
      placeholder="dd/mm/yyyy"
      maxlength="10"
      :disabled="props.disabled"
      :color="invalid ? 'error' : undefined"
      :highlight="invalid"
      :aria-label="props.ariaLabel"
      :aria-invalid="invalid || undefined"
      @update:model-value="onInput"
      @blur="onBlur"
    >
      <template #trailing>
        <UButton
          size="xs"
          color="neutral"
          variant="link"
          icon="i-lucide-calendar"
          :disabled="props.disabled"
          :aria-label="t('dates.openCalendar')"
          @click="openPicker"
        />
      </template>
    </UInput>
    <!-- The browser's calendar, opened by the button; only its value is used. -->
    <input
      ref="picker"
      type="date"
      tabindex="-1"
      aria-hidden="true"
      class="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
      :value="model"
      :min="props.min"
      :max="props.max"
      @change="onPicked"
    />
  </div>
</template>

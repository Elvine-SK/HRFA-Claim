<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    length?: number
    invalid?: boolean
    disabled?: boolean
    label: string
    autofocus?: boolean
  }>(),
  { length: 6, invalid: false, disabled: false, autofocus: true },
)
const emit = defineEmits<{ complete: [code: string] }>()
const model = defineModel<string>({ default: '' })

const cells = useTemplateRef<HTMLInputElement[]>('cells')
const shaking = ref(false)
const digits = computed(() => Array.from({ length: props.length }, (_, i) => model.value[i] ?? ''))

watch(
  () => props.invalid,
  (bad) => {
    if (!bad) return
    shaking.value = false
    requestAnimationFrame(() => (shaking.value = true))
  },
)

function focusAt(index: number) {
  const el = cells.value?.[Math.max(0, Math.min(index, props.length - 1))]
  el?.focus()
  el?.select()
}

// Returns the new code: with a parent v-model, `model.value` keeps the old value until the parent re-renders.
function setFrom(index: number, raw: string) {
  const incoming = raw.replace(/\D/g, '')
  const chars = digits.value.slice()
  for (let i = 0; i < incoming.length && index + i < props.length; i++) chars[index + i] = incoming[i]!
  const code = chars.join('').slice(0, props.length)
  model.value = code
  return { code, next: Math.min(index + incoming.length, props.length - 1) }
}

function onInput(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  const { code, next } = setFrom(index, input.value)
  input.value = code[index] ?? ''
  if (input.value) focusAt(next)
  if (code.length === props.length) emit('complete', code)
}

function onKeydown(index: number, event: KeyboardEvent) {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    event.preventDefault()
    const chars = digits.value.slice()
    chars[index - 1] = ''
    model.value = chars.join('')
    focusAt(index - 1)
  } else if (event.key === 'ArrowLeft') focusAt(index - 1)
  else if (event.key === 'ArrowRight') focusAt(index + 1)
}

function onPaste(index: number, event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  if (!text) return
  event.preventDefault()
  const { code, next } = setFrom(index, text)
  focusAt(next)
  if (code.length === props.length) emit('complete', code)
}

onMounted(() => {
  if (props.autofocus) focusAt(Math.min(model.value.length, props.length - 1))
})

defineExpose({ focus: () => focusAt(0) })
</script>

<template>
  <div
    class="otp"
    :class="{ bad: invalid, shake: shaking }"
    role="group"
    :aria-label="label"
    :style="{ '--n': length }"
    @animationend="shaking = false"
  >
    <input
      v-for="(digit, i) in digits"
      ref="cells"
      :key="i"
      :value="digit"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      maxlength="1"
      :autocomplete="i === 0 ? 'one-time-code' : 'off'"
      :aria-label="`${label} ${i + 1}`"
      :aria-invalid="invalid || undefined"
      :disabled="disabled"
      @input="onInput(i, $event)"
      @keydown="onKeydown(i, $event)"
      @paste="onPaste(i, $event)"
      @focus="($event.target as HTMLInputElement).select()"
    />
  </div>
</template>

<style scoped>
.otp {
  display: grid;
  grid-template-columns: repeat(var(--n), minmax(0, 1fr));
  gap: 8px;
}
.otp input {
  width: 100%;
  min-width: 0;
  height: 56px;
  padding: 0;
  border: 1.5px solid var(--app-border);
  border-radius: var(--app-r-sm);
  outline: 0;
  background: var(--app-surface);
  color: var(--app-text);
  font: 600 22px var(--app-font-mono, ui-monospace, monospace);
  text-align: center;
  transition:
    border-color var(--app-dur-base),
    box-shadow var(--app-dur-base);
}
.otp input:nth-child(3) {
  margin-right: 10px;
}
.otp input:focus {
  border-color: var(--app-accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--app-accent) 20%, transparent);
}
.otp.bad input {
  border-color: var(--app-bad);
}
.otp.shake input {
  animation: shake 0.35s;
}
@keyframes shake {
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .otp.shake input {
    animation: none;
  }
}
</style>

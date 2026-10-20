<script setup lang="ts">
withDefaults(
  defineProps<{
    id?: string
    name?: string
    autocomplete?: 'current-password' | 'new-password'
    invalid?: boolean
    disabled?: boolean
    autofocus?: boolean
  }>(),
  { id: undefined, name: 'password', autocomplete: 'current-password' },
)
const model = defineModel<string>({ default: '' })
const { t } = useI18n()
const visible = ref(false)
</script>

<template>
  <UInput
    :id="id"
    v-model="model"
    :name="name"
    :type="visible ? 'text' : 'password'"
    :autocomplete="autocomplete"
    :color="invalid ? 'error' : undefined"
    :highlight="invalid"
    :disabled="disabled"
    :autofocus="autofocus"
    size="lg"
    class="w-full"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :aria-label="visible ? t('auth.password.hide') : t('auth.password.show')"
        :aria-pressed="visible"
        :aria-controls="id"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>

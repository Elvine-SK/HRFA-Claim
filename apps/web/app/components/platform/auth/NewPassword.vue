<script setup lang="ts">
const props = defineProps<{
  email?: string | null
  name?: string | null
  error?: string
  submitted?: boolean
}>()
const password = defineModel<string>({ default: '' })
const { t } = useI18n()
const confirmation = ref('')

const acceptable = computed(() =>
  passwordAcceptable(password.value, { email: props.email, name: props.name }),
)
const matches = computed(() => !!confirmation.value && confirmation.value === password.value)
const mismatch = computed(() =>
  (props.submitted || confirmation.value.length >= password.value.length) &&
  confirmation.value &&
  !matches.value
    ? t('auth.password.mismatch')
    : undefined,
)
const policyError = computed(
  () => props.error ?? (props.submitted && !acceptable.value ? t('auth.password.weak') : undefined),
)

defineExpose({ valid: computed(() => acceptable.value && matches.value) })
</script>

<template>
  <div class="grid gap-4">
    <UFormField :label="t('auth.fields.newPassword')" :error="policyError">
      <PlatformAuthPasswordInput
        id="new-password"
        v-model="password"
        name="new-password"
        autocomplete="new-password"
        :invalid="!!policyError"
      />
      <PlatformAuthPasswordStrength :password="password" :email="email" :name="name" />
    </UFormField>
    <UFormField :label="t('auth.fields.confirmPassword')" :error="mismatch">
      <PlatformAuthPasswordInput
        id="confirm-password"
        v-model="confirmation"
        name="confirm-password"
        autocomplete="new-password"
        :invalid="!!mismatch"
      />
    </UFormField>
  </div>
</template>

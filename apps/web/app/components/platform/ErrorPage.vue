<script setup lang="ts">
export type ErrorKind = 403 | 404 | 500 | 401

const props = defineProps<{ status: ErrorKind | number; requestId?: string; message?: string }>()
const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const { paletteOpen } = useCommands()

const kind = computed<ErrorKind>(() =>
  ([401, 403, 404] as number[]).includes(props.status) ? (props.status as ErrorKind) : 500,
)
const code = computed(() => (kind.value === 401 ? '401' : String(props.status)))
</script>

<template>
  <section class="err" :aria-labelledby="`err-title-${code}`">
    <p class="code mono text-grad" aria-hidden="true">{{ code }}</p>
    <h1 :id="`err-title-${code}`">{{ t(`states.${kind}.title`) }}</h1>
    <p class="text">{{ message ?? t(`states.${kind}.text`) }}</p>
    <p v-if="requestId" class="mono mt-2 text-xs text-muted">
      {{ t('platform.errors.requestId', { id: requestId }) }}
    </p>
    <div class="mt-6 flex flex-wrap justify-center gap-2">
      <template v-if="kind === 404">
        <UButton to="/" icon="i-lucide-house">{{ t('states.goHome') }}</UButton>
        <UButton color="neutral" variant="outline" icon="i-lucide-search" @click="paletteOpen = true">
          {{ t('states.search') }}
        </UButton>
      </template>
      <template v-else-if="kind === 403">
        <UButton disabled icon="i-lucide-key-round">{{ t('states.requestAccess') }}</UButton>
        <UButton to="/" color="neutral" variant="outline">{{ t('states.goHome') }}</UButton>
      </template>
      <template v-else-if="kind === 401">
        <UButton icon="i-lucide-log-in" disabled>{{ t('states.signIn') }}</UButton>
      </template>
      <template v-else>
        <UButton icon="i-lucide-rotate-cw" @click="emit('retry')">{{ t('platform.actions.retry') }}</UButton>
        <UButton to="/" color="neutral" variant="outline">{{ t('states.goHome') }}</UButton>
      </template>
    </div>
  </section>
</template>

<style scoped>
.err {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 72px 20px;
  text-align: center;
}
.code {
  font-size: clamp(64px, 12vw, 112px);
  font-weight: 600;
  letter-spacing: -0.06em;
  line-height: 1;
}
h1 {
  margin-top: 12px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.text {
  max-width: 420px;
  margin-top: 8px;
  color: var(--app-muted);
}
</style>

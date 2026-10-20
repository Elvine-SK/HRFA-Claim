<script setup lang="ts">
import { useOnline } from '@vueuse/core'

const { t } = useI18n()
const online = useOnline()
const notify = useNotify()

watch(online, (now, before) => {
  if (now && before === false) notify.success(t('platform.states.backOnline'))
})
</script>

<template>
  <div
    v-if="!online"
    role="status"
    class="tone-tint flex items-center gap-2 border-b border-(--app-warn)/30 px-7 py-2 text-[13px] font-medium max-[900px]:px-4"
    style="--tone: var(--app-warn)"
  >
    <UIcon name="i-lucide-wifi-off" class="size-4 shrink-0" />
    {{ t('platform.states.offline') }}
  </div>
</template>

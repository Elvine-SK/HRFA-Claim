<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import type { DelegateCandidate } from '../../../types/approval'

/** Finds an active colleague to hand approvals to. */
defineProps<{ invalid?: boolean }>()
const model = defineModel<string | undefined>()
const emit = defineEmits<{ pick: [person: DelegateCandidate] }>()
const { t } = useI18n()

const term = ref('')
const search = useDelegateSearch(refDebounced(term, 250))
// Kept so the trigger still names the pick after the results change.
const picked = ref<DelegateCandidate | null>(null)
const items = computed(() => {
  const found = (search.data.value ?? []).map((p) => ({ value: p.id, label: p.displayName }))
  const current = picked.value
  if (current && current.id === model.value && !found.some((i) => i.value === current.id))
    found.unshift({ value: current.id, label: current.displayName })
  return found
})

function choose(id: string) {
  const item = items.value.find((i) => i.value === id)
  if (!item) return
  picked.value = { id: item.value, displayName: item.label }
  model.value = id
  emit('pick', picked.value)
}
</script>

<template>
  <USelectMenu
    v-model:search-term="term"
    :model-value="model"
    :items="items"
    value-key="value"
    ignore-filter
    :loading="search.isFetching.value"
    :placeholder="t('approval.delegate.pick')"
    :search-input="{ placeholder: t('approval.delegate.search') }"
    :color="invalid ? 'error' : undefined"
    :highlight="invalid"
    icon="i-lucide-user"
    class="w-full"
    @update:model-value="(v: string) => choose(v)"
  >
    <template #item-leading="{ item }">
      <PlatformUserAvatar :name="item.label" :seed="item.value" size="xs" />
    </template>
    <template #empty>
      {{ term.trim().length < 2 ? t('approval.delegate.search') : t('approval.delegate.none') }}
    </template>
  </USelectMenu>
</template>

<script setup lang="ts">
import type { BuilderField } from '@elvine-sk/platform-nuxt/utils'

const props = defineProps<{
  fields: Record<string, BuilderField>
  resolvers: readonly string[]
  defaultOpen?: boolean
}>()
const { t } = useI18n()

const items = computed(() => [{ value: 'facts', label: t('admin.workflows.facts'), icon: 'i-lucide-braces' }])
const open = ref(props.defaultOpen ? 'facts' : undefined)
</script>

<template>
  <div class="card px-4">
    <UAccordion v-model="open" :items="items" :ui="{ label: 'text-[13.5px] font-semibold' }">
      <template #body>
        <div class="flex flex-wrap gap-1.5">
          <UBadge v-for="(f, name) in fields" :key="name" color="neutral" variant="subtle" class="font-mono">
            {{ name }} <span class="muted">· {{ f.type }}</span>
          </UBadge>
        </div>
        <p v-if="resolvers.length" class="muted mt-3 text-[12.5px]">
          {{ t('admin.workflows.resolvers') }}: <code>{{ resolvers.join(', ') }}</code>
        </p>
      </template>
    </UAccordion>
  </div>
</template>

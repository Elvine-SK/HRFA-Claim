<script setup lang="ts">
import type { Tone } from '../utils/tone'

definePageMeta({ title: 'system.title' })

const { t } = useI18n()
const notify = useNotify()
const confirm = useConfirm()

const tones: Tone[] = [
  'neutral',
  'info',
  'warning',
  'success',
  'danger',
  'accent',
  'chart-2',
  'chart-3',
  'chart-4',
]
const text = ref('')
const choice = ref('one')
const enabled = ref(true)
const checked = ref(true)
const errorTab = ref<'404' | '403' | '500' | '401'>('404')
const errorTabs = [
  { label: '404', value: '404' },
  { label: '403', value: '403' },
  { label: '500', value: '500' },
  { label: 'Session', value: '401' },
]

async function askConfirm() {
  const ok = await confirm({
    title: 'Delete “Example”?',
    description: 'This can’t be undone.',
    confirmLabel: 'Delete',
    danger: true,
  })
  if (ok) notify.success('Deleted', '“Example” was deleted.')
}

function failToast() {
  notify.error(
    new ApiError({
      status: 500,
      code: 'server.internal',
      message: 'Something went wrong',
      requestId: '01a1-demo',
    }),
  )
}
</script>

<template>
  <div>
    <PlatformPageHeader
      :eyebrow="t('system.eyebrow')"
      :title="t('system.title')"
      :subtitle="t('system.subtitle')"
    />

    <div class="gallery">
      <UCard class="span-6">
        <template #header>Buttons</template>
        <div class="flex flex-wrap items-center gap-2">
          <UButton icon="i-lucide-plus">Primary</UButton>
          <UButton color="neutral" variant="outline">Outline</UButton>
          <UButton color="neutral" variant="ghost">Ghost</UButton>
          <UButton color="error" variant="soft" icon="i-lucide-trash-2">Danger</UButton>
          <UButton size="sm">Small</UButton>
          <UButton size="lg">Large</UButton>
          <UButton color="neutral" variant="ghost" square icon="i-lucide-settings" aria-label="Settings" />
          <UButton loading>Saving</UButton>
          <UButton disabled>Disabled</UButton>
        </div>
      </UCard>

      <UCard class="span-6">
        <template #header>Status badges</template>
        <div class="flex flex-wrap gap-2">
          <PlatformStatusBadge v-for="tone in tones" :key="tone" :tone="tone" :label="tone" />
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UBadge>Nuxt UI badge</UBadge>
          <UBadge color="neutral" variant="outline">Outline</UBadge>
          <UKbd value="Ctrl" /><UKbd value="K" />
          <UTooltip text="Inverted tooltip"
            ><UButton color="neutral" variant="outline" size="sm">Hover me</UButton></UTooltip
          >
        </div>
      </UCard>

      <UCard class="span-6">
        <template #header>Inputs</template>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Title" required hint="Shown in lists">
            <UInput v-model="text" placeholder="Type something" class="w-full" />
          </UFormField>
          <UFormField label="Choice">
            <USelect v-model="choice" :items="['one', 'two', 'three']" class="w-full" />
          </UFormField>
          <UFormField label="With error" error="This field is required">
            <UInput placeholder="Invalid" class="w-full" />
          </UFormField>
          <UFormField label="Notes" class="sm:col-span-2">
            <UTextarea placeholder="Longer text" class="w-full" />
          </UFormField>
          <div class="flex items-center gap-6">
            <USwitch v-model="enabled" label="Switch" />
            <UCheckbox v-model="checked" label="Checkbox" />
          </div>
        </div>
      </UCard>

      <UCard class="span-6">
        <template #header>Feedback</template>
        <div class="flex flex-wrap gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="notify.success('Saved', 'Your changes were saved.')"
          >
            Success toast
          </UButton>
          <UButton color="neutral" variant="outline" @click="failToast">Error toast</UButton>
          <UButton
            color="neutral"
            variant="outline"
            @click="notify.undoable('Archived “Example”', () => notify.info('Restored'))"
          >
            Undo toast
          </UButton>
          <UButton color="error" variant="soft" @click="askConfirm">Confirm dialog</UButton>
        </div>
        <p class="eyebrow mt-6 mb-3">Skeletons</p>
        <div class="flex flex-col gap-2.5">
          <USkeleton class="h-4 w-2/3" />
          <USkeleton class="h-4 w-1/2" />
          <div class="flex items-center gap-3">
            <USkeleton class="size-9 rounded-full" />
            <div class="flex flex-1 flex-col gap-2">
              <USkeleton class="h-3.5 w-1/3" />
              <USkeleton class="h-3 w-1/4" />
            </div>
          </div>
        </div>
      </UCard>

      <UCard class="span-4">
        <PlatformEmptyState
          kind="first-use"
          title="No notes yet"
          text="Create the first note to get started."
        >
          <template #actions><UButton icon="i-lucide-plus">New note</UButton></template>
        </PlatformEmptyState>
      </UCard>
      <UCard class="span-4">
        <PlatformEmptyState
          kind="no-results"
          title="No notes match"
          text="Try a different search or clear the filters."
        >
          <template #actions><UButton color="neutral" variant="outline">Clear filters</UButton></template>
        </PlatformEmptyState>
      </UCard>
      <UCard class="span-4">
        <PlatformEmptyState kind="all-done" title="All done" text="Nothing is waiting for you." />
      </UCard>

      <UCard class="span-12">
        <template #header>Error pages</template>
        <UTabs v-model="errorTab" :items="errorTabs" :content="false" />
        <PlatformErrorPage
          :status="Number(errorTab)"
          :request-id="errorTab === '500' ? '01a1-demo' : undefined"
        />
      </UCard>
    </div>
  </div>
</template>

<style scoped>
.gallery {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--app-gap);
}
.span-4 {
  grid-column: span 4;
}
.span-6 {
  grid-column: span 6;
}
.span-12 {
  grid-column: span 12;
}
@media (max-width: 1100px) {
  .gallery > * {
    grid-column: 1 / -1;
  }
}
</style>

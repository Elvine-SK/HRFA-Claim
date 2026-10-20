<script setup lang="ts">
/** The home page when platform-dashboard is installed (UI spec §5.13). */
import { useNow } from '@vueuse/core'

const { t } = useI18n()
const session = useSession()
const notify = useNotify()
const layout = useDashboardLayout()
const editing = ref(false)
const catalogOpen = ref(false)
const placed = computed(() => layout.items.value.map((item) => item.id))
const { dayjs } = useDates()

// The greeting follows the clock; the summary counts what is waiting on this person.
const now = useNow({ interval: 60_000 })
const daypart = computed(() => {
  const hour = now.value.getHours()
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
})
const today = computed(() => dayjs(now.value).format('dddd · D MMM YYYY'))
const firstName = computed(() => session.user.value?.displayName.split(' ')[0] ?? '')
const inboxCount = useInboxCount()
const waiting = computed(() => inboxCount.data.value ?? 0)

const titleOf = (id: string) => {
  const widget = layout.widget(id)
  return widget ? t(widget.title) : id
}

function remove(id: string) {
  const title = titleOf(id)
  layout.remove(id)
  notify.info(t('dashboard.removed', { title }))
}

function add(id: string) {
  layout.add(id)
  notify.success(t('dashboard.added', { title: titleOf(id) }))
}

function openCatalog() {
  editing.value = true
  catalogOpen.value = true
}
</script>

<template>
  <div>
    <PlatformPageHeader
      :eyebrow="today"
      eyebrow-icon="i-lucide-sparkles"
      :title="t(`dashboard.greeting.${daypart}`, { name: firstName })"
    >
      <template #title>
        <i18n-t :keypath="`dashboard.greeting.${daypart}`" scope="global">
          <template #name
            ><span class="text-grad">{{ firstName }}</span></template
          >
        </i18n-t>
      </template>
      <template #subtitle>
        <i18n-t v-if="waiting" keypath="dashboard.summary" scope="global">
          <template #count
            ><b>{{ t('dashboard.approvalCount', waiting) }}</b></template
          >
        </i18n-t>
        <template v-else>{{ t('dashboard.subtitle') }}</template>
      </template>
      <template #actions>
        <template v-if="editing">
          <UButton color="neutral" variant="outline" icon="i-lucide-plus" @click="catalogOpen = true">
            {{ t('dashboard.addWidget') }}
          </UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-rotate-ccw" @click="layout.reset()">
            {{ t('dashboard.reset') }}
          </UButton>
          <UButton icon="i-lucide-check" @click="editing = false">{{ t('dashboard.done') }}</UButton>
        </template>
        <UButton
          v-else-if="layout.visible.value.length && !layout.saved.isError.value"
          color="neutral"
          variant="outline"
          icon="i-lucide-layout-grid"
          @click="editing = true"
        >
          {{ t('dashboard.customize') }}
        </UButton>
      </template>
    </PlatformPageHeader>
    <p v-if="editing" class="edit-hint">
      <UIcon name="i-lucide-grip-vertical" class="size-4" />
      {{ t('dashboard.editHint') }}
    </p>

    <div v-if="layout.saved.isPending.value" class="grid grid-cols-12 gap-(--app-gap)" aria-busy="true">
      <USkeleton class="col-span-12 h-28" />
      <USkeleton class="col-span-12 h-56 min-[1101px]:col-span-6" />
      <USkeleton class="col-span-12 h-56 min-[1101px]:col-span-6" />
    </div>
    <!-- Without the saved layout an edit would overwrite it, so nothing is editable until it loads. -->
    <UAlert
      v-else-if="layout.saved.isError.value"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      data-testid="layout-error"
      :title="t('dashboard.loadFailed')"
      :description="layout.saved.error.value?.message"
      :actions="[
        {
          label: t('platform.actions.retry'),
          color: 'neutral',
          variant: 'outline',
          onClick: () => void layout.saved.refetch(),
        },
      ]"
    />
    <PlatformEmptyState
      v-else-if="!layout.visible.value.length"
      :title="t('dashboard.emptyNone')"
      :text="t('dashboard.emptyNoneText')"
    />
    <PlatformEmptyState
      v-else-if="!layout.items.value.length"
      :title="t('dashboard.emptyTitle')"
      :text="t('dashboard.emptyText')"
    >
      <template #actions>
        <UButton icon="i-lucide-layout-grid" @click="openCatalog">{{ t('dashboard.addWidget') }}</UButton>
      </template>
    </PlatformEmptyState>
    <PlatformDashboardGrid
      v-else
      :items="layout.items.value"
      :editing="editing"
      @move="layout.move"
      @resize="layout.resize"
      @remove="remove"
      @add="catalogOpen = true"
    />

    <PlatformDashboardWidgetCatalog
      v-model:open="catalogOpen"
      :visible="layout.visible.value"
      :locked="layout.locked.value"
      :placed="placed"
      :missing="layout.missing"
      @add="add"
    />
  </div>
</template>

<style scoped>
.edit-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -8px 0 14px;
  color: var(--app-muted);
  font-size: 12.5px;
}
</style>

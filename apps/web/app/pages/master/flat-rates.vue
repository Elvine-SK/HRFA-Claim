<script setup lang="ts">
definePageMeta({ title: 'master.flatRates.title' })

const { t } = useI18n()
const { date } = useDates()
const access = useAccess()
const notify = useNotify()
const canManage = computed(() => access.canSome('travel_master.manage'))

const rates = useTravelFlatRates()
const removeSet = useConfirmedRemoval()
const { publishFlatRate, deleteFlatRate } = useTravelMasterMutations()
const today = todayLaos()

const open = ref(false)
const form = reactive({ key: 'same_day' as FlatRateKey, effectiveFrom: '', amount: '' })
const formError = ref<string | null>(null)

function openForm(key: FlatRateKey) {
  Object.assign(form, { key, effectiveFrom: '', amount: '' })
  formError.value = null
  open.value = true
}

async function publish() {
  formError.value = null
  if (!isDate(form.effectiveFrom)) return void (formError.value = t('master.dateInvalid'))
  if (!isAmount(form.amount)) return void (formError.value = t('master.amountInvalid'))
  try {
    await publishFlatRate.mutateAsync({ key: form.key, effectiveFrom: form.effectiveFrom, amount: form.amount })
    open.value = false
    notify.success(t('master.published'))
  } catch (error) {
    formError.value = notify.messageOf(error)
  }
}

function remove(key: FlatRateKey, from: string) {
  void removeSet(`${t(`master.flatRates.keys.${key}`)} ${date(from)}`, () =>
    deleteFlatRate.mutateAsync({ key, effectiveFrom: from }),
  )
}
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('master.flatRates.title')" :subtitle="t('master.flatRates.line')" />
    <USkeleton v-if="rates.isPending.value" class="h-48" />
    <UAlert v-else-if="rates.error.value" color="error" variant="subtle" :title="notify.messageOf(rates.error.value)" />
    <div v-else class="grid gap-4 lg:grid-cols-3">
      <UCard v-for="rate in rates.data.value" :key="rate.key">
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <p class="font-medium">{{ t(`master.flatRates.keys.${rate.key}`) }}</p>
            <UButton v-if="canManage" size="sm" icon="i-lucide-plus" @click="openForm(rate.key)">{{
              t('master.newValue')
            }}</UButton>
          </div>
        </template>
        <p class="text-2xl font-semibold tabular-nums">
          {{ formatAmount(rate.current?.amount, FLAT_RATE_CURRENCY[rate.key]) }}
        </p>
        <p v-if="rate.current" class="text-[13px] text-muted">
          {{ t('master.setFrom', { date: date(rate.current.effectiveFrom) }) }}
        </p>
        <p v-else class="text-[13px] text-muted">{{ t('master.flatRates.none') }}</p>
        <div v-if="rate.future.length" class="mt-4">
          <p class="mb-1 text-[13px] font-medium">{{ t('master.futureValues') }}</p>
          <ul class="grid gap-1">
            <li v-for="f in rate.future" :key="f.effectiveFrom" class="flex items-center gap-2">
              <span class="mono">{{ date(f.effectiveFrom) }}</span>
              <span class="tabular-nums">{{ formatAmount(f.amount, FLAT_RATE_CURRENCY[rate.key]) }}</span>
              <UBadge v-if="f.effectiveFrom > today" color="info" variant="subtle" size="sm">{{
                t('master.future')
              }}</UBadge>
              <UButton
                v-if="canManage && f.effectiveFrom > today"
                class="ms-auto"
                size="sm"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                :aria-label="t('platform.actions.delete')"
                @click="remove(rate.key, f.effectiveFrom)"
              />
            </li>
          </ul>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="open" :title="t('master.flatRates.newTitle', { name: t(`master.flatRates.keys.${form.key}`) })">
      <template #body>
        <form id="flat-form" class="grid gap-4" novalidate @submit.prevent="publish">
          <UAlert v-if="formError" color="error" variant="subtle" :description="formError" />
          <UFormField :label="t('master.effectiveFrom')" :hint="t('master.futureHint')" required>
            <UInput v-model="form.effectiveFrom" type="date" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('master.amount')"
            :hint="FLAT_RATE_CURRENCY[form.key] ?? undefined"
            required
          >
            <UInput v-model="form.amount" inputmode="decimal" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">{{ t('platform.actions.cancel') }}</UButton>
          <UButton type="submit" form="flat-form" :loading="publishFlatRate.isPending.value">{{
            t('master.publish')
          }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

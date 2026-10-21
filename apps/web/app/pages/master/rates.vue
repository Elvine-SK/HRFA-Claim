<script setup lang="ts">
definePageMeta({ title: 'master.rates.title' })

const { t } = useI18n()
const { date } = useDates()
const access = useAccess()
const notify = useNotify()
const canManage = computed(() => access.canSome('travel_master.manage'))

const zones = useTravelZones()
const ranks = useTravelRanks()
const localName = useLocalName()
const removeSet = useConfirmedRemoval()
const { publishRates, deleteRates } = useTravelMasterMutations()

const zone = ref('')
const on = ref('')
watch(
  () => zones.data.value,
  (list) => {
    if (!zone.value && list?.length) zone.value = list[0]!.code
  },
  { immediate: true },
)
const zoneTabs = computed(() => (zones.data.value ?? []).map((z) => ({ label: localName(z), value: z.code })))

const rateSet = useTravelRateSet(zone, () => (isDate(on.value) ? on.value : undefined))
const shown = computed(() => rateSet.data.value?.data ?? null)
const currency = computed(() => zones.data.value?.find((z) => z.code === zone.value)?.currency ?? shown.value?.currency)
const rankName = (code: string) => localName(ranks.data.value?.find((r) => r.code === code))

type Row = { rankCode: string; daily: string; accommodation: string; personal: string }
const open = ref(false)
const effectiveFrom = ref('')
const rows = ref<Row[]>([])
const formError = ref<string | null>(null)

function openForm() {
  const current = new Map((shown.value?.rows ?? []).map((r) => [r.rankCode, r]))
  rows.value = RANK_CODES.map((code) => {
    const r = current.get(code)
    return { rankCode: code, daily: r?.daily ?? '', accommodation: r?.accommodation ?? '', personal: r?.personal ?? '' }
  })
  effectiveFrom.value = ''
  formError.value = null
  open.value = true
}

async function publish() {
  formError.value = null
  if (!isDate(effectiveFrom.value)) return void (formError.value = t('master.dateInvalid'))
  const bad = rows.value.some(
    (r) => !isAmount(r.daily) || !isAmount(r.accommodation) || (r.personal !== '' && !isAmount(r.personal)),
  )
  if (bad) return void (formError.value = t('master.amountInvalid'))
  try {
    await publishRates.mutateAsync({
      zoneCode: zone.value,
      effectiveFrom: effectiveFrom.value,
      rows: rows.value.map((r) => ({
        rankCode: r.rankCode as (typeof RANK_CODES)[number],
        daily: r.daily,
        accommodation: r.accommodation,
        personal: r.personal === '' ? null : r.personal,
      })),
    })
    open.value = false
    notify.success(t('master.published'))
  } catch (error) {
    formError.value = notify.messageOf(error)
  }
}

function remove(from: string) {
  void removeSet(`${zone.value} ${date(from)}`, () =>
    deleteRates.mutateAsync({ zoneCode: zone.value, effectiveFrom: from }),
  )
}
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('master.rates.title')" :subtitle="t('master.rates.line')">
      <template v-if="canManage" #actions>
        <UButton icon="i-lucide-plus" :disabled="!zone" @click="openForm">{{ t('master.newSet') }}</UButton>
      </template>
    </PlatformPageHeader>

    <UTabs v-model="zone" :items="zoneTabs" :content="false" class="mb-4" />

    <div class="grid items-start gap-4 lg:grid-cols-[1fr_16rem]">
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="font-medium">
                {{ on ? t('master.rates.onDate', { date: date(on) }) : t('master.rates.today') }}
              </p>
              <p v-if="shown" class="text-[13px] text-muted">
                {{ t('master.setFrom', { date: date(shown.effectiveFrom) }) }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UInput v-model="on" type="date" :aria-label="t('master.seeDate')" />
              <UButton v-if="on" color="neutral" variant="ghost" @click="on = ''">{{ t('master.todayButton') }}</UButton>
            </div>
          </div>
        </template>
        <USkeleton v-if="rateSet.isPending.value" class="h-48" />
        <UAlert
          v-else-if="rateSet.error.value"
          color="error"
          variant="subtle"
          :title="notify.messageOf(rateSet.error.value)"
        />
        <p v-else-if="!shown" class="p-4 text-muted">{{ t('master.rates.none') }}</p>
        <MasterTable v-else :caption="t('master.rates.title')">
          <thead>
            <tr>
              <th>{{ t('master.rates.rank') }}</th>
              <th class="mt-num">{{ t('master.rates.daily') }}</th>
              <th class="mt-num">{{ t('master.rates.accommodation') }}</th>
              <th class="mt-num">{{ t('master.rates.personal') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shown.rows" :key="r.rankCode">
              <td>
                <span class="mono">{{ r.rankCode }}</span> <span class="text-muted">{{ rankName(r.rankCode) }}</span>
              </td>
              <td class="mt-num">{{ formatAmount(r.daily, shown.currency) }}</td>
              <td class="mt-num">{{ formatAmount(r.accommodation, shown.currency) }}</td>
              <td class="mt-num">{{ formatAmount(r.personal, shown.currency) }}</td>
            </tr>
          </tbody>
        </MasterTable>
      </UCard>

      <UCard>
        <template #header>
          <p class="font-medium">{{ t('master.setDates') }}</p>
        </template>
        <MasterSetDates :sets="rateSet.data.value?.sets ?? []" :can-manage="canManage" @remove="remove" />
      </UCard>
    </div>

    <UModal v-model:open="open" :title="t('master.rates.newTitle', { zone })" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <form id="rates-form" class="grid gap-4" novalidate @submit.prevent="publish">
          <UAlert v-if="formError" color="error" variant="subtle" :description="formError" />
          <UFormField :label="t('master.effectiveFrom')" :hint="t('master.futureHint')" required>
            <UInput v-model="effectiveFrom" type="date" class="w-full sm:w-56" />
          </UFormField>
          <p class="text-[13px] text-muted">{{ t('master.amountsIn', { currency: currency ?? '' }) }}</p>
          <div class="grid gap-3">
            <div
              v-for="r in rows"
              :key="r.rankCode"
              class="grid grid-cols-2 items-end gap-2 sm:grid-cols-[6rem_1fr_1fr_1fr]"
            >
              <p class="col-span-2 font-medium sm:col-span-1 sm:pb-2">
                <span class="mono">{{ r.rankCode }}</span>
              </p>
              <UFormField :label="t('master.rates.daily')">
                <UInput v-model="r.daily" inputmode="decimal" class="w-full" />
              </UFormField>
              <UFormField :label="t('master.rates.accommodation')">
                <UInput v-model="r.accommodation" inputmode="decimal" class="w-full" />
              </UFormField>
              <UFormField :label="t('master.rates.personal')">
                <UInput v-model="r.personal" inputmode="decimal" class="w-full" />
              </UFormField>
            </div>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">{{ t('platform.actions.cancel') }}</UButton>
          <UButton type="submit" form="rates-form" :loading="publishRates.isPending.value">{{
            t('master.publish')
          }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

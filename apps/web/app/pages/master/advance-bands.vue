<script setup lang="ts">
definePageMeta({ title: 'master.advanceBands.title' })

const { t } = useI18n()
const { date } = useDates()
const access = useAccess()
const notify = useNotify()
const canManage = computed(() => access.canSome('travel_master.manage'))

const removeSet = useConfirmedRemoval()
const { publishBands, deleteBands } = useTravelMasterMutations()

const sets = {
  domestic_days: useTravelBandSet('domestic_days'),
  group_size: useTravelBandSet('group_size'),
}

type FormRow = { minCount: string; maxCount: string; amount: string }
const open = ref(false)
const kind = ref<AdvanceKind>('domestic_days')
const effectiveFrom = ref('')
const rows = ref<FormRow[]>([])
const formError = ref<string | null>(null)

function openForm(k: AdvanceKind) {
  kind.value = k
  const current = sets[k].data.value?.data?.bands ?? []
  rows.value = current.map((b) => ({
    minCount: String(b.minCount),
    maxCount: b.maxCount === null ? '' : String(b.maxCount),
    amount: b.amount,
  }))
  if (!rows.value.length) rows.value = [{ minCount: '1', maxCount: '', amount: '' }]
  effectiveFrom.value = ''
  formError.value = null
  open.value = true
}

const addBand = () => rows.value.push({ minCount: '', maxCount: '', amount: '' })
const removeBand = (index: number) => rows.value.splice(index, 1)
const isCount = (value: string) => /^\d{1,6}$/.test(value) && Number(value) >= 1

async function publish() {
  formError.value = null
  if (!isDate(effectiveFrom.value)) return void (formError.value = t('master.dateInvalid'))
  const bad = rows.value.some(
    (r) => !isCount(r.minCount) || (r.maxCount !== '' && !isCount(r.maxCount)) || !isAmount(r.amount),
  )
  if (bad || !rows.value.length) return void (formError.value = t('master.advanceBands.rowInvalid'))
  try {
    await publishBands.mutateAsync({
      kind: kind.value,
      effectiveFrom: effectiveFrom.value,
      bands: rows.value.map((r) => ({
        minCount: Number(r.minCount),
        maxCount: r.maxCount === '' ? null : Number(r.maxCount),
        amount: r.amount,
      })),
    })
    open.value = false
    notify.success(t('master.published'))
  } catch (error) {
    // The API's own text (for example the bands must start at 1, follow each other and end open).
    formError.value = notify.messageOf(error)
  }
}

function remove(k: AdvanceKind, from: string) {
  void removeSet(`${t(`master.advanceBands.kinds.${k}`)} ${date(from)}`, () =>
    deleteBands.mutateAsync({ kind: k, effectiveFrom: from }),
  )
}
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('master.advanceBands.title')" :subtitle="t('master.advanceBands.line')" />
    <div class="grid gap-6">
      <UCard v-for="k in ADVANCE_KINDS" :key="k" :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="font-medium">{{ t(`master.advanceBands.kinds.${k}`) }}</p>
              <p v-if="sets[k].data.value?.data" class="text-[13px] text-muted">
                {{ t('master.setFrom', { date: date(sets[k].data.value!.data!.effectiveFrom) }) }}
              </p>
            </div>
            <UButton v-if="canManage" size="sm" icon="i-lucide-plus" @click="openForm(k)">{{
              t('master.newSet')
            }}</UButton>
          </div>
        </template>
        <USkeleton v-if="sets[k].isPending.value" class="h-32" />
        <UAlert
          v-else-if="sets[k].error.value"
          color="error"
          variant="subtle"
          :title="notify.messageOf(sets[k].error.value)"
        />
        <div v-else class="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <p v-if="!sets[k].data.value?.data" class="p-4 text-muted">{{ t('master.advanceBands.none') }}</p>
          <MasterTable v-else :caption="t(`master.advanceBands.kinds.${k}`)">
            <thead>
              <tr>
                <th class="mt-num">{{ t(`master.advanceBands.min.${k}`) }}</th>
                <th class="mt-num">{{ t(`master.advanceBands.max.${k}`) }}</th>
                <th class="mt-num">{{ t('master.amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in sets[k].data.value.data.bands" :key="b.minCount">
                <td class="mt-num">{{ b.minCount }}</td>
                <td class="mt-num">{{ b.maxCount ?? t('master.advanceBands.open') }}</td>
                <td class="mt-num">{{ formatAmount(b.amount, ADVANCE_CURRENCY[k]) }}</td>
              </tr>
            </tbody>
          </MasterTable>
          <div class="p-4">
            <p class="mb-1 text-[13px] font-medium">{{ t('master.setDates') }}</p>
            <MasterSetDates :sets="sets[k].data.value?.sets ?? []" :can-manage="canManage" @remove="(d) => remove(k, d)" />
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="open" :title="t('master.advanceBands.newTitle', { name: t(`master.advanceBands.kinds.${kind}`) })">
      <template #body>
        <form id="bands-form" class="grid gap-4" novalidate @submit.prevent="publish">
          <UAlert v-if="formError" color="error" variant="subtle" :description="formError" />
          <UFormField :label="t('master.effectiveFrom')" :hint="t('master.futureHint')" required>
            <AppDateInput v-model="effectiveFrom" class="w-full sm:w-56" />
          </UFormField>
          <p class="text-[13px] text-muted">{{ t('master.amountsIn', { currency: ADVANCE_CURRENCY[kind] }) }}</p>
          <div class="grid gap-3">
            <div
              v-for="(r, index) in rows"
              :key="index"
              class="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]"
            >
              <UFormField :label="t(`master.advanceBands.min.${kind}`)">
                <UInput v-model="r.minCount" inputmode="numeric" class="w-full" />
              </UFormField>
              <UFormField :label="t(`master.advanceBands.max.${kind}`)">
                <UInput v-model="r.maxCount" inputmode="numeric" :placeholder="t('master.advanceBands.open')" class="w-full" />
              </UFormField>
              <UFormField :label="t('master.amount')" class="col-span-2 sm:col-span-1">
                <UInput v-model="r.amount" inputmode="decimal" class="w-full" />
              </UFormField>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-trash-2"
                :disabled="rows.length < 2"
                :aria-label="t('platform.actions.remove')"
                @click="removeBand(index)"
              />
            </div>
          </div>
          <div>
            <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-plus" @click="addBand">{{
              t('master.advanceBands.addBand')
            }}</UButton>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">{{ t('platform.actions.cancel') }}</UButton>
          <UButton type="submit" form="bands-form" :loading="publishBands.isPending.value">{{
            t('master.publish')
          }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

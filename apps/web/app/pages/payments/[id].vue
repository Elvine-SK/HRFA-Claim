<script setup lang="ts">
definePageMeta({ title: 'payments.detail.title' })

const { t } = useI18n()
const route = useRoute()
const notify = useNotify()
const access = useAccess()
const confirm = useConfirm()
const id = computed(() => String(route.params.id))
const payment = usePayment(id)
const p = computed(() => payment.data.value)
useHead({ title: () => p.value?.ref ?? t('payments.detail.title') })

const { recalculate, saveBills, exportFile, markPosted, download } = usePaymentMutations()
const form = useFormErrors<string>()

const canCalculate = computed(() => access.canSome('payment.calculate'))
const canExport = computed(() => access.canSome('payment.export'))
const editable = computed(() => p.value?.status === 'calculated' && canCalculate.value)
const batch = computed(() => p.value?.batch ?? null)

const rows = computed(() => {
  const x = p.value
  if (!x) return []
  const out = [
    [t('agreements.field.docNo'), x.docNo],
    [t('agreements.field.formType'), t(`agreements.formType.${x.formType}`)],
    [t('agreements.field.travel'), `${formatDayFirst(x.travelFrom)} – ${formatDayFirst(x.travelTo)}`],
    [t('agreements.field.branch'), x.branchCode],
  ]
  if (x.zoneCode) out.push([t('payments.field.zone'), x.zoneCode])
  if (x.exportedAt) out.push([t('payments.field.exportedAt'), formatDayFirst(x.exportedAt.slice(0, 10))])
  if (x.postedAt) out.push([t('payments.field.postedAt'), formatDayFirst(x.postedAt.slice(0, 10))])
  if (x.coreRef) out.push([t('payments.field.coreRef'), x.coreRef])
  return out
})
const totals = computed(() => Object.entries(p.value?.totals ?? {}))

// Bills for nights from day 8: a text field per flagged night, kept as the decimal string the API takes.
const bills = reactive<Record<string, string>>({})
const billKey = (eid: string, night: number) => `${eid}:${night}`
watch(
  p,
  (x) => {
    for (const key of Object.keys(bills)) delete bills[key]
    for (const b of x?.bills ?? []) bills[billKey(b.eid, b.night)] = b.amount
  },
  { immediate: true },
)
const flagsOf = (eid: string) => p.value?.flags.find((f) => f.eid === eid)?.billedNights ?? []
const hasFlags = computed(() => (p.value?.flags ?? []).some((f) => f.billedNights.length))

async function run<T>(action: () => Promise<T>, done?: string): Promise<T | undefined> {
  form.clear()
  try {
    const result = await action()
    if (done) notify.success(done)
    return result
  } catch (error) {
    form.apply(error)
    notify.error(error)
  }
}

async function onSaveBills() {
  const x = p.value
  if (!x) return
  form.clear()
  const list: { eid: string; night: number; amount: string }[] = []
  for (const f of x.flags)
    for (const night of f.billedNights) {
      const amount = (bills[billKey(f.eid, night)] ?? '').trim()
      if (!isAmount(amount)) {
        form.message.value = t('payments.bills.invalid')
        return
      }
      list.push({ eid: f.eid, night, amount })
    }
  await run(() => saveBills.mutateAsync({ id: x.id, version: x.version, bills: list }), t('payments.bills.saved'))
}

async function onRecalculate() {
  const x = p.value
  if (!x) return
  const ok = await confirm({
    title: t('payments.detail.recalculateTitle', { ref: x.ref }),
    description: t('payments.detail.recalculateText'),
    confirmLabel: t('payments.detail.recalculate'),
  })
  if (ok) await run(() => recalculate.mutateAsync({ id: x.id, version: x.version }), t('payments.detail.recalculated'))
}

async function onExport() {
  const x = p.value
  if (!x) return
  const ok = await confirm({
    title: t('payments.detail.exportTitle', { ref: x.ref }),
    description: t('payments.detail.exportText'),
    confirmLabel: t('payments.detail.export'),
  })
  if (ok) await run(() => exportFile.mutateAsync({ id: x.id, version: x.version }), t('payments.detail.exported'))
}

const downloading = ref(false)
async function onDownload() {
  if (!batch.value) return
  downloading.value = true
  try {
    await download(batch.value.id, batch.value.fileName)
  } catch (error) {
    notify.error(error)
  } finally {
    downloading.value = false
  }
}

const posting = ref(false)
const coreRef = ref('')
async function onPosted() {
  const x = p.value
  if (!x) return
  const done = await run(
    () => markPosted.mutateAsync({ id: x.id, version: x.version, coreRef: coreRef.value.trim() || undefined }),
    t('payments.detail.postedDone'),
  )
  if (done) {
    posting.value = false
    coreRef.value = ''
  }
}
</script>

<template>
  <USkeleton v-if="payment.isPending.value" class="h-96" />
  <PlatformErrorPage v-else-if="payment.error.value" :status="payment.error.value.status ?? 500" />
  <div v-else-if="p">
    <PlatformPageHeader :title="p.subject" :eyebrow="p.ref" :subtitle="t('payments.detail.title')">
      <template #actions>
        <UBadge :color="PAYMENT_TONE[p.status]" variant="subtle" size="lg">{{ t(`payments.status.${p.status}`) }}</UBadge>
        <UButton v-if="editable" icon="i-lucide-refresh-cw" variant="soft" :loading="recalculate.isPending.value" @click="onRecalculate">{{
          t('payments.detail.recalculate')
        }}</UButton>
        <UButton
          v-if="p.status === 'approved' && canExport"
          icon="i-lucide-file-spreadsheet"
          :loading="exportFile.isPending.value"
          @click="onExport"
          >{{ t('payments.detail.export') }}</UButton
        >
        <UButton v-if="batch" icon="i-lucide-download" variant="soft" :loading="downloading" @click="onDownload">{{
          t('payments.detail.download')
        }}</UButton>
        <UButton
          v-if="p.status === 'exported' && canExport"
          icon="i-lucide-check-check"
          color="success"
          variant="soft"
          @click="posting = true"
          >{{ t('payments.detail.markPosted') }}</UButton
        >
      </template>
    </PlatformPageHeader>

    <UAlert v-if="form.message.value" class="mb-4" color="error" variant="subtle" :title="form.message.value" />
    <UAlert
      v-if="p.status === 'cancelled_after_export'"
      class="mb-4"
      color="error"
      variant="subtle"
      :title="t('payments.detail.cancelledAfterExport')"
      :description="t('payments.detail.cancelledAfterExportText')"
    />

    <div class="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div class="grid min-w-0 gap-4">
        <UCard>
          <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div v-for="[label, value] in rows" :key="label">
              <dt class="text-sm text-[var(--ui-text-muted)]">{{ label }}</dt>
              <dd class="break-words">{{ value }}</dd>
            </div>
          </dl>
        </UCard>

        <UCard v-for="m in p.members" :key="m.eid" :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span class="font-medium">{{ m.nameLao }} {{ m.snameLao }}</span>
                <span class="mono ms-2 text-sm text-[var(--ui-text-muted)]">{{ m.eid }}</span>
                <UBadge v-if="m.rankCode" class="ms-2" color="neutral" variant="subtle">{{ m.rankCode }}</UBadge>
              </div>
              <div class="text-sm text-[var(--ui-text-muted)]">
                {{ formatDayFirst(m.departureDate) }} – {{ formatDayFirst(m.returnDate) }} ·
                {{ t('payments.member.days', { n: m.paidDays }, m.paidDays) }}
              </div>
            </div>
          </template>
          <MasterTable :caption="`${m.eid} ${m.nameLao}`">
            <thead>
              <tr>
                <th>{{ t('payments.item.component') }}</th>
                <th class="mt-num">{{ t('payments.item.rate') }}</th>
                <th class="mt-num">{{ t('payments.item.count') }}</th>
                <th class="mt-num">{{ t('payments.item.amount') }}</th>
                <th>{{ t('payments.item.basis') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in m.items" :key="`${item.component}-${i}`">
                <td>{{ t(`payments.component.${item.component}`) }}</td>
                <td class="mt-num mono">{{ formatAmount(item.rate, item.currency) }}</td>
                <td class="mt-num mono">× {{ item.count }}</td>
                <td class="mt-num mono">{{ formatAmount(item.amount, item.currency) }}</td>
                <td class="text-sm text-[var(--ui-text-muted)]">{{ item.basis }}</td>
              </tr>
              <tr v-if="!m.items.length">
                <td colspan="5" class="text-[var(--ui-text-muted)]">{{ t('payments.item.none') }}</td>
              </tr>
            </tbody>
          </MasterTable>
          <div v-if="flagsOf(m.eid).length" class="border-t border-default p-4">
            <p class="mb-1 text-sm font-medium">{{ t('payments.bills.title') }}</p>
            <p class="mb-3 text-sm text-[var(--ui-text-muted)]">{{ t('payments.bills.hint') }}</p>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <UFormField v-for="night in flagsOf(m.eid)" :key="night" :label="t('payments.bills.night', { n: night })">
                <UInput
                  v-model="bills[billKey(m.eid, night)]"
                  class="w-full"
                  inputmode="decimal"
                  :disabled="!editable"
                  :placeholder="t('payments.bills.placeholder')"
                />
              </UFormField>
            </div>
          </div>
        </UCard>

        <div v-if="hasFlags && editable" class="flex justify-end">
          <UButton icon="i-lucide-save" :loading="saveBills.isPending.value" @click="onSaveBills">{{ t('payments.bills.save') }}</UButton>
        </div>
      </div>

      <div class="grid content-start gap-4">
        <UCard>
          <template #header>
            <span class="font-medium">{{ t('payments.totals.title') }}</span>
          </template>
          <dl v-if="totals.length" class="grid gap-2">
            <div v-for="[currency, amount] in totals" :key="currency" class="flex justify-between gap-3">
              <dt class="text-[var(--ui-text-muted)]">{{ currency }}</dt>
              <dd class="mono font-medium">{{ formatAmount(amount, currency) }}</dd>
            </div>
          </dl>
          <p v-else class="text-sm text-[var(--ui-text-muted)]">{{ t('payments.totals.none') }}</p>
        </UCard>

        <PlatformApprovalRecordStatus
          entity-type="payment"
          :entity-id="p.id"
          :submit-path="`/payments/${p.id}/submit`"
          :submittable="editable"
          @submitted="payment.refetch()"
        />

        <UCard v-if="batch">
          <template #header>
            <span class="font-medium">{{ t('payments.batch.title') }}</span>
          </template>
          <dl class="grid gap-2 text-sm">
            <div>
              <dt class="text-[var(--ui-text-muted)]">{{ t('payments.batch.file') }}</dt>
              <dd class="mono break-all">{{ batch.fileName }}</dd>
            </div>
            <div>
              <dt class="text-[var(--ui-text-muted)]">{{ t('payments.batch.branch') }}</dt>
              <dd>{{ batch.branchCode }}</dd>
            </div>
            <div v-if="batch.cancelledAfterExportAt">
              <dt class="text-[var(--ui-text-muted)]">{{ t('payments.batch.cancelledAt') }}</dt>
              <dd>{{ formatDayFirst(batch.cancelledAfterExportAt.slice(0, 10)) }}</dd>
            </div>
          </dl>
        </UCard>
      </div>
    </div>

    <UModal v-model:open="posting" :title="t('payments.detail.markPostedTitle', { ref: p.ref })">
      <template #body>
        <p class="mb-3 text-sm text-[var(--ui-text-muted)]">{{ t('payments.detail.markPostedText') }}</p>
        <UFormField :label="t('payments.field.coreRef')" :hint="t('payments.detail.optional')">
          <UInput v-model="coreRef" class="w-full" maxlength="100" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="posting = false">{{ t('platform.actions.cancel') }}</UButton>
          <UButton color="success" :loading="markPosted.isPending.value" @click="onPosted">{{ t('payments.detail.markPosted') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

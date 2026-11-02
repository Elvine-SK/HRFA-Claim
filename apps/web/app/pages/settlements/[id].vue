<script setup lang="ts">
definePageMeta({ title: 'settlements.detail.title' })

const { t } = useI18n()
const route = useRoute()
const notify = useNotify()
const access = useAccess()
const confirm = useConfirm()
const id = computed(() => String(route.params.id))
const settlement = useSettlement(id)
const s = computed(() => settlement.data.value)
useHead({ title: () => s.value?.ref ?? t('settlements.detail.title') })

// Members file and edit the draft (ກ13): the caller's EID against the agreement's members.
const me = useApiItem<{ eid: string }>('hrm-me', '/hrm/me', { retry: false })
const agreement = useApiItem<Agreement>('agreements', () => (s.value ? `/agreements/${s.value.agreementId}` : null))
const isMember = computed(() => {
  const eid = me.data.value?.eid
  return !!eid && (agreement.data.value?.members ?? []).some((m) => m.eid === eid)
})
const isDraft = computed(() => s.value?.status === 'draft')
const editable = computed(() => isDraft.value && isMember.value)
const canExport = computed(() => access.canSome('settlement.export'))
const overseas = computed(() => s.value?.zoneKind === 'overseas')

const files = useSettlementFiles(id)
const fileItems = computed(() => (files.data.value ?? []).map((f) => ({ label: f.filename, value: f.id })))
const fileName = (fileId: string | null) => files.data.value?.find((f) => f.id === fileId)?.filename ?? '—'

const { save, submit, exportFile, markPosted, exportClearing, markCleared, download } = useSettlementMutations()

// The lines as typed: strings the API takes, refilled from the server unless there are unsaved edits.
interface LineDraft {
  description: string
  expenseType: 'fuel' | 'fare' | undefined
  currency: string
  amount: string
  crossRate: string
  receiptFileId: string
  noReceiptReason: string
  rateProofFileId: string
}
/** The select's "no file" choice (a select item cannot have an empty value). */
const NONE = 'none'
const lines = ref<LineDraft[]>([])
const caseKind = ref<CaseKind | undefined>(undefined)
const dirty = ref(false)
const toDraft = (l: SettlementLine): LineDraft => ({
  description: l.description,
  expenseType: l.expenseType ?? undefined,
  currency: l.currency,
  amount: l.amount,
  crossRate: l.crossRate ?? '',
  receiptFileId: l.receiptFileId ?? NONE,
  noReceiptReason: l.noReceiptReason ?? '',
  rateProofFileId: l.rateProofFileId ?? NONE,
})
watch(
  s,
  (x) => {
    if (!x || dirty.value) return
    fill(x)
  },
  { immediate: true },
)
watch([lines, caseKind], () => (dirty.value = true), { deep: true, flush: 'sync' })
/** The form from the server's settlement; the sync watcher marks it dirty, so that is undone right after. */
function fill(x: Settlement) {
  lines.value = x.lines.map(toDraft)
  caseKind.value = x.caseKind ?? undefined
  dirty.value = false
}
const reset = () => s.value && fill(s.value)
function addLine() {
  lines.value.push({
    description: '',
    expenseType: undefined,
    currency: s.value?.currency ?? 'LAK',
    amount: '',
    crossRate: '',
    receiptFileId: NONE,
    noReceiptReason: '',
    rateProofFileId: NONE,
  })
}
const otherCurrency = (l: LineDraft) => !!s.value && l.currency.trim().toUpperCase() !== s.value.currency

const form = useFormErrors<string>()
const known = computed(() =>
  lines.value.flatMap((_, n) =>
    ['description', 'expenseType', 'currency', 'amount', 'crossRate', 'receiptFileId', 'rateProofFileId'].map((f) => `lines.${n}.${f}`),
  ),
)
const fieldError = (n: number, field: string) => form.fields[`lines.${n}.${field}`]

async function run<T>(action: () => Promise<T>, done?: string): Promise<T | undefined> {
  form.clear()
  try {
    const result = await action()
    if (done) notify.success(done)
    return result
  } catch (error) {
    form.apply(error, known.value)
    notify.error(error)
  }
}

async function onSave() {
  const x = s.value
  if (!x) return
  const body = lines.value.map((l) => {
    const other = otherCurrency(l)
    return {
      description: l.description.trim(),
      ...(l.expenseType && !overseas.value ? { expenseType: l.expenseType } : {}),
      currency: l.currency.trim().toUpperCase(),
      amount: l.amount.trim(),
      ...(other && l.crossRate.trim() ? { crossRate: l.crossRate.trim() } : {}),
      ...(l.receiptFileId !== NONE ? { receiptFileId: l.receiptFileId } : {}),
      ...(l.receiptFileId === NONE && l.noReceiptReason.trim() ? { noReceiptReason: l.noReceiptReason.trim() } : {}),
      ...(other && l.rateProofFileId !== NONE ? { rateProofFileId: l.rateProofFileId } : {}),
    }
  })
  const done = await run(
    () => save.mutateAsync({ id: x.id, version: x.version, caseKind: caseKind.value ?? null, lines: body }),
    t('settlements.detail.saved'),
  )
  if (done) fill(done)
}

// Submitting: the leader or deputy of step 2, and a reason when late.
const submitting = ref(false)
const leaderEid = ref('')
const lateReason = ref('')
const leaderItems = computed(() => (s.value?.candidates ?? []).map((c) => ({ label: `${c.name} (${c.eid})`, value: c.eid })))
async function onSubmit() {
  const x = s.value
  if (!x) return
  const done = await run(
    () =>
      submit.mutateAsync({
        id: x.id,
        version: x.version,
        leaderEid: leaderEid.value || undefined,
        lateReason: lateReason.value.trim() || undefined,
      }),
    t('settlements.detail.submitted'),
  )
  if (done) submitting.value = false
}

async function onExport() {
  const x = s.value
  if (!x) return
  const ok = await confirm({
    title: t('settlements.detail.exportTitle', { ref: x.ref }),
    description: t('settlements.detail.exportText'),
    confirmLabel: t('settlements.detail.export'),
  })
  if (ok) await run(() => exportFile.mutateAsync({ id: x.id, version: x.version }), t('settlements.detail.exported'))
}
async function onClearing() {
  const x = s.value
  if (!x) return
  const ok = await confirm({
    title: t('settlements.detail.clearingTitle', { ref: x.ref }),
    description: t('settlements.detail.clearingText', { rvs: x.rvsNo ?? '' }),
    confirmLabel: t('settlements.detail.clearing'),
  })
  if (ok) await run(() => exportClearing.mutateAsync({ id: x.id, version: x.version }), t('settlements.detail.exported'))
}

const downloading = ref<string | null>(null)
async function onDownload(kind: BatchFileKind, file: string) {
  if (!s.value) return
  downloading.value = kind
  try {
    await download(s.value.id, kind, file)
  } catch (error) {
    notify.error(error)
  } finally {
    downloading.value = null
  }
}

// Posted: CORE's reference, and the suspense number when the settlement passes through the holding account.
const posting = ref<'settlement' | 'clearing' | null>(null)
const coreRef = ref('')
const rvsNo = ref('')
watch(posting, (open) => {
  if (!open) coreRef.value = rvsNo.value = ''
})
async function onPosted() {
  const x = s.value
  if (!x || !posting.value) return
  const done =
    posting.value === 'settlement'
      ? await run(
          () =>
            markPosted.mutateAsync({
              id: x.id,
              version: x.version,
              coreRef: coreRef.value.trim() || undefined,
              rvsNo: rvsNo.value.trim() || undefined,
            }),
          t('settlements.detail.postedDone'),
        )
      : await run(
          () => markCleared.mutateAsync({ id: x.id, version: x.version, coreRef: coreRef.value.trim() || undefined }),
          t('settlements.detail.postedDone'),
        )
  if (done) posting.value = null
}

const rows = computed(() => {
  const x = s.value
  if (!x) return []
  const out = [
    [t('agreements.field.docNo'), x.docNo],
    [t('agreements.field.travel'), `${formatDayFirst(x.travelFrom)} – ${formatDayFirst(x.travelTo)}`],
    [t('settlements.field.holder'), x.holderName],
    [t('settlements.field.advance'), formatAmount(x.advance, x.currency)],
    [t('settlements.field.dueDate'), formatDayFirst(x.dueDate)],
    [t('settlements.field.zoneKind'), t(`master.postingEntries.kind.${x.zoneKind}`)],
  ]
  if (x.leaderEid) out.push([t('settlements.field.leader'), x.leaderEid])
  if (x.lateReason) out.push([t('settlements.field.lateReason'), x.lateReason])
  if (x.coreRef) out.push([t('payments.field.coreRef'), x.coreRef])
  if (x.rvsNo) out.push([t('settlements.field.rvsNo'), x.rvsNo])
  if (x.clearingCoreRef) out.push([t('settlements.field.clearingCoreRef'), x.clearingCoreRef])
  return out
})
const remainingText = computed(() => {
  const totals = s.value?.totals
  if (!totals || !s.value) return ''
  if (totals.returned !== '0.00') return t('settlements.totals.returned', { amount: formatAmount(totals.returned, s.value.currency) })
  if (totals.excess !== '0.00') return t('settlements.totals.excess', { amount: formatAmount(totals.excess, s.value.currency) })
  return t('settlements.totals.even')
})
</script>

<template>
  <USkeleton v-if="settlement.isPending.value" class="h-96" />
  <PlatformErrorPage v-else-if="settlement.error.value" :status="settlement.error.value.status ?? 500" />
  <div v-else-if="s">
    <PlatformPageHeader :title="s.subject" :eyebrow="s.ref" :subtitle="t('settlements.detail.title')">
      <template #actions>
        <UBadge :color="SETTLEMENT_TONE[s.status]" variant="subtle" size="lg">{{ t(`settlements.status.${s.status}`) }}</UBadge>
        <UBadge v-if="s.isLate && isDraft" color="warning" variant="subtle" size="lg">{{ t('settlements.detail.late') }}</UBadge>
        <UButton v-if="editable" icon="i-lucide-send" :disabled="dirty" @click="submitting = true">{{ t('settlements.detail.submit') }}</UButton>
        <UButton v-if="s.status === 'approved' && canExport" icon="i-lucide-file-spreadsheet" :loading="exportFile.isPending.value" @click="onExport">{{
          t('settlements.detail.export')
        }}</UButton>
        <UButton v-if="s.status === 'exported' && canExport" icon="i-lucide-check-check" color="success" variant="soft" @click="posting = 'settlement'">{{
          t('payments.detail.markPosted')
        }}</UButton>
        <UButton
          v-if="s.status === 'posted' && s.totals.needsClearing && canExport"
          icon="i-lucide-arrow-right-left"
          :loading="exportClearing.isPending.value"
          @click="onClearing"
          >{{ t('settlements.detail.clearing') }}</UButton
        >
        <UButton
          v-if="s.status === 'clearing_exported' && canExport"
          icon="i-lucide-check-check"
          color="success"
          variant="soft"
          @click="posting = 'clearing'"
          >{{ t('settlements.detail.markCleared') }}</UButton
        >
      </template>
    </PlatformPageHeader>

    <UAlert v-if="form.message.value" class="mb-4" color="error" variant="subtle" :title="form.message.value" />
    <UAlert
      v-if="s.status === 'cancelled_after_export'"
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

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-medium">{{ t('settlements.lines.title') }}</span>
              <UButton v-if="editable" icon="i-lucide-plus" size="sm" variant="soft" @click="addLine">{{ t('settlements.lines.add') }}</UButton>
            </div>
          </template>

          <div v-if="editable" class="grid gap-4 p-4">
            <p v-if="!lines.length" class="text-sm text-[var(--ui-text-muted)]">{{ t('settlements.lines.none') }}</p>
            <div v-for="(l, n) in lines" :key="n" class="grid gap-3 rounded-md border border-default p-3 sm:grid-cols-2">
              <UFormField class="sm:col-span-2" :label="t('settlements.lines.description')" :error="fieldError(n, 'description')">
                <UInput v-model="l.description" class="w-full" maxlength="300" />
              </UFormField>
              <UFormField v-if="!overseas" :label="t('settlements.lines.expenseType')" :error="fieldError(n, 'expenseType')">
                <USelect
                  v-model="l.expenseType"
                  class="w-full"
                  :items="EXPENSE_TYPES.map((e) => ({ label: t(`settlements.expenseType.${e}`), value: e }))"
                />
              </UFormField>
              <UFormField :label="t('settlements.lines.currency')" :error="fieldError(n, 'currency')">
                <UInput v-model="l.currency" class="w-full" maxlength="3" />
              </UFormField>
              <UFormField :label="t('settlements.lines.amount')" :error="fieldError(n, 'amount')">
                <UInput v-model="l.amount" class="w-full" inputmode="decimal" />
              </UFormField>
              <UFormField
                v-if="otherCurrency(l)"
                :label="t('settlements.lines.crossRate')"
                :hint="t('settlements.lines.crossRateHint', { ccy: s.currency })"
                :error="fieldError(n, 'crossRate')"
              >
                <UInput v-model="l.crossRate" class="w-full" inputmode="decimal" />
              </UFormField>
              <UFormField :label="t('settlements.lines.receipt')" :error="fieldError(n, 'receiptFileId')">
                <USelect v-model="l.receiptFileId" class="w-full" :items="[{ label: t('settlements.lines.noReceipt'), value: NONE }, ...fileItems]" />
              </UFormField>
              <UFormField v-if="l.receiptFileId === NONE" :label="t('settlements.lines.noReceiptReason')">
                <UInput v-model="l.noReceiptReason" class="w-full" maxlength="500" />
              </UFormField>
              <UFormField v-if="otherCurrency(l)" :label="t('settlements.lines.rateProof')" :error="fieldError(n, 'rateProofFileId')">
                <USelect v-model="l.rateProofFileId" class="w-full" :items="[{ label: '—', value: NONE }, ...fileItems]" />
              </UFormField>
              <div class="flex items-end justify-end sm:col-span-2">
                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="lines.splice(n, 1)">{{
                  t('settlements.lines.remove')
                }}</UButton>
              </div>
            </div>
            <div class="flex flex-wrap items-end justify-between gap-3">
              <UFormField :label="t('settlements.field.caseKind')" :hint="t('settlements.lines.caseHint', { kind: t(`settlements.case.${s.totals.caseKind}`) })">
                <USelect
                  v-model="caseKind"
                  class="w-64"
                  :items="CASE_KINDS.map((c) => ({ label: t(`settlements.case.${c}`), value: c }))"
                />
              </UFormField>
              <div class="flex gap-2">
                <UButton v-if="dirty" color="neutral" variant="ghost" @click="reset">{{ t('platform.actions.cancel') }}</UButton>
                <UButton icon="i-lucide-save" :loading="save.isPending.value" @click="onSave">{{ t('settlements.lines.save') }}</UButton>
              </div>
            </div>
          </div>

          <MasterTable v-else :caption="t('settlements.lines.title')">
            <thead>
              <tr>
                <th>{{ t('settlements.lines.description') }}</th>
                <th v-if="!overseas">{{ t('settlements.lines.expenseType') }}</th>
                <th class="mt-num">{{ t('settlements.lines.amount') }}</th>
                <th class="mt-num">{{ t('settlements.lines.crossRate') }}</th>
                <th class="mt-num">{{ t('settlements.lines.settled') }}</th>
                <th>{{ t('settlements.lines.receipt') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in s.lines" :key="l.id" :class="{ 'bg-[var(--ui-bg-elevated)]': !l.receiptFileId }">
                <td>{{ l.description }}</td>
                <td v-if="!overseas">{{ l.expenseType ? t(`settlements.expenseType.${l.expenseType}`) : '—' }}</td>
                <td class="mt-num mono">{{ formatAmount(l.amount, l.currency) }}</td>
                <td class="mt-num mono">{{ l.crossRate ?? '—' }}</td>
                <td class="mt-num mono">{{ formatAmount(l.settledAmount, s.currency) }}</td>
                <td>
                  <span v-if="l.receiptFileId">{{ fileName(l.receiptFileId) }}</span>
                  <UBadge v-else color="warning" variant="subtle">{{ t('settlements.lines.noReceiptBadge', { reason: l.noReceiptReason ?? '' }) }}</UBadge>
                </td>
              </tr>
              <tr v-if="!s.lines.length">
                <td :colspan="overseas ? 5 : 6" class="text-[var(--ui-text-muted)]">{{ t('settlements.lines.none') }}</td>
              </tr>
            </tbody>
          </MasterTable>
        </UCard>

        <PlatformFilesAttachments entity-type="settlement" :entity-id="s.id" upload="auto" :locked="!editable" @count="files.refetch()" />
      </div>

      <div class="grid content-start gap-4">
        <UCard>
          <template #header>
            <span class="font-medium">{{ t('settlements.totals.title') }}</span>
          </template>
          <dl class="grid gap-2">
            <div class="flex justify-between gap-3">
              <dt class="text-[var(--ui-text-muted)]">{{ t('settlements.field.advance') }}</dt>
              <dd class="mono">{{ formatAmount(s.advance, s.currency) }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-[var(--ui-text-muted)]">{{ t('settlements.field.total') }}</dt>
              <dd class="mono">{{ formatAmount(s.totals.total, s.currency) }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-[var(--ui-text-muted)]">{{ t('settlements.field.caseKind') }}</dt>
              <dd>{{ t(`settlements.case.${s.totals.caseKind}`) }}</dd>
            </div>
          </dl>
          <p class="mt-3 text-sm text-[var(--ui-text-muted)]">{{ remainingText }}</p>
          <p v-if="s.totals.needsClearing" class="mt-2 text-sm text-[var(--ui-text-muted)]">
            {{ t('settlements.totals.holding', { amount: formatAmount(s.totals.holding, s.currency) }) }}
          </p>
        </UCard>

        <PlatformApprovalRecordStatus entity-type="settlement" :entity-id="s.id" />

        <UCard v-if="s.batches.length">
          <template #header>
            <span class="font-medium">{{ t('payments.batch.title') }}</span>
          </template>
          <div class="grid gap-3 text-sm">
            <div v-for="b in s.batches" :key="b.id" class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="font-medium">{{ t(`settlements.batch.${b.kind}`) }}</p>
                <p class="mono break-all text-[var(--ui-text-muted)]">{{ b.fileName }}</p>
              </div>
              <UButton icon="i-lucide-download" size="sm" variant="soft" :loading="downloading === b.kind" @click="onDownload(b.kind, b.fileName)" />
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <UModal v-model:open="submitting" :title="t('settlements.detail.submitTitle', { ref: s.ref })">
      <template #body>
        <div class="grid gap-3">
          <UFormField v-if="leaderItems.length" :label="t('settlements.field.leader')" :hint="t('settlements.detail.leaderHint')">
            <USelect v-model="leaderEid" class="w-full" :items="leaderItems" />
          </UFormField>
          <p v-else class="text-sm text-[var(--ui-text-muted)]">{{ t('settlements.detail.noLeaderStep') }}</p>
          <UFormField v-if="s.isLate" :label="t('settlements.field.lateReason')" :hint="t('settlements.detail.lateHint', { date: formatDayFirst(s.dueDate) })">
            <UTextarea v-model="lateReason" class="w-full" maxlength="500" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="submitting = false">{{ t('platform.actions.cancel') }}</UButton>
          <UButton :loading="submit.isPending.value" @click="onSubmit">{{ t('settlements.detail.submit') }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="posting !== null"
      :title="t(posting === 'clearing' ? 'settlements.detail.markClearedTitle' : 'payments.detail.markPostedTitle', { ref: s.ref })"
      @update:open="(open: boolean) => (open ? null : (posting = null))"
    >
      <template #body>
        <p class="mb-3 text-sm text-[var(--ui-text-muted)]">{{ t('payments.detail.markPostedText') }}</p>
        <div class="grid gap-3">
          <UFormField :label="t('payments.field.coreRef')" :hint="t('payments.detail.optional')">
            <UInput v-model="coreRef" class="w-full" maxlength="50" />
          </UFormField>
          <UFormField
            v-if="posting === 'settlement' && s.totals.needsClearing"
            :label="t('settlements.field.rvsNo')"
            :hint="t('settlements.detail.rvsHint')"
            required
          >
            <UInput v-model="rvsNo" class="w-full" maxlength="30" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="posting = null">{{ t('platform.actions.cancel') }}</UButton>
          <UButton color="success" :loading="markPosted.isPending.value || markCleared.isPending.value" @click="onPosted">{{
            t('payments.detail.markPosted')
          }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

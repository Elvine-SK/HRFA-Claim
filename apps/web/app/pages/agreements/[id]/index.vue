<script setup lang="ts">
definePageMeta({ title: 'agreements.detail.title' })

const { t } = useI18n()
const route = useRoute()
const notify = useNotify()
const access = useAccess()
const placeName = usePlaceName()
const localName = useLocalName()
const id = computed(() => String(route.params.id))
const agreement = useAgreement(id)
const history = useAgreementHistory(id)
const a = computed(() => agreement.data.value)
useHead({ title: () => a.value?.ref ?? t('agreements.detail.title') })

const tab = useQueryParam('tab', 'members')
const tabs = computed(() => [
  { label: t('agreements.members.title'), value: 'members', icon: 'i-lucide-users' },
  { label: t('agreements.detail.files'), value: 'files', icon: 'i-lucide-paperclip' },
  { label: t('agreements.detail.history'), value: 'history', icon: 'i-lucide-history' },
])

const provinces = useProvinces()
const province = (code: string | null) => placeName(provinces.data.value?.find((p) => p.code === code)) || code || '—'
const districts = useDistricts(() => a.value?.provinceCode)
const district = (code: string | null) => placeName(districts.data.value?.find((d) => d.code === code)) || code || '—'
const routes = useTravelBorderRoutes()

const where = computed(() => {
  const x = a.value
  if (!x) return ''
  switch (x.formType) {
    case 'domestic':
      return `${province(x.fromProvinceCode)} → ${province(x.toProvinceCode)}`
    case 'district':
      return `${province(x.provinceCode)}: ${district(x.fromDistrictCode)} → ${district(x.toDistrictCode)}`
    case 'overseas':
      return `${x.countryIso2}${x.zoneCode ? ` (${x.zoneCode})` : ''}`
    case 'border': {
      const r = routes.data.value?.find((r) => r.id === x.borderRouteId)
      return `${province(x.fromProvinceCode)} → ${r ? localName(r) : (x.borderRouteOther ?? '—')}`
    }
  }
  return ''
})

const rows = computed(() => {
  const x = a.value
  if (!x) return []
  const out = [
    [t('agreements.field.docNo'), x.docNo],
    [t('agreements.field.docDate'), formatDayFirst(x.docDate)],
    [t('agreements.field.subject'), x.subject],
    [t('agreements.field.title'), x.title],
    [t('agreements.field.reference'), x.reference ?? '—'],
    [t('agreements.field.travel'), `${formatDayFirst(x.travelFrom)} – ${formatDayFirst(x.travelTo)}`],
    [t('agreements.field.where'), where.value],
    [t('agreements.field.policy'), t(`agreements.policy.${x.policyOption}`)],
    [t('agreements.field.hasAdvance'), x.hasAdvance ? t('agreements.form.yes') : t('agreements.form.no')],
    [t('agreements.field.branch'), x.branchCode],
  ]
  if (x.formType === 'district')
    out.push([
      t('agreements.field.overnight'),
      x.overnight
        ? t('agreements.form.yes')
        : `${t('agreements.form.no')} · ${x.sameDayOver50km ? t('agreements.form.over50') : t('agreements.form.under50')}`,
    ])
  if (x.status === 'cancelled') out.push([t('agreements.field.cancelReason'), x.cancelReason ?? '—'])
  return out
})

const roleOf = (m: AgreementMember) =>
  [
    m.isLeader && t('agreements.member.leader'),
    m.isDeputy && t('agreements.member.deputy'),
    m.isAdvanceHolder && t('agreements.member.holder'),
  ]
    .filter(Boolean)
    .join(', ')

// Cancel (spec §8, ກ16): a reviewer, or anyone with the cancel right, with a reason.
const { cancel } = useAgreementMutations()
const cancelling = ref(false)
const reason = ref('')
const canCancel = computed(() => a.value?.status !== 'cancelled')
async function confirmCancel() {
  if (!a.value || !reason.value.trim()) return
  try {
    await cancel.mutateAsync({ id: a.value.id, version: a.value.version, reason: reason.value.trim() })
    cancelling.value = false
    notify.success(t('agreements.detail.cancelled'))
  } catch (error) {
    notify.error(error)
  }
}
// Finance opens the payment of an approved agreement, calculating it the first time.
const { lookup: findPayment, create: createPayment } = usePaymentMutations()
const router = useRouter()
const canPay = computed(() => a.value?.status === 'approved' && access.canSome('payment.calculate'))
async function openPayment() {
  if (!a.value) return
  try {
    const found = await findPayment.mutateAsync(a.value.ref)
    const paymentId = found.paymentId ?? (await createPayment.mutateAsync(a.value.id)).id
    await router.push(`/payments/${paymentId}`)
  } catch (error) {
    notify.error(error)
  }
}
const isDraft = computed(() => a.value?.status === 'draft')
const mayEdit = computed(() => isDraft.value && access.canSome('agreement.create'))
</script>

<template>
  <USkeleton v-if="agreement.isPending.value" class="h-96" />
  <PlatformErrorPage v-else-if="agreement.error.value" :status="agreement.error.value.status ?? 500" />
  <div v-else-if="a">
    <PlatformPageHeader :title="a.subject" :eyebrow="a.ref" :subtitle="t(`agreements.formType.${a.formType}`)">
      <template #actions>
        <UBadge :color="STATUS_TONE[a.status]" variant="subtle" size="lg">{{ t(`agreements.status.${a.status}`) }}</UBadge>
        <UButton v-if="mayEdit" icon="i-lucide-pencil" variant="soft" :to="`/agreements/${a.id}/edit`">{{
          t('platform.actions.edit')
        }}</UButton>
        <UButton v-if="canPay" icon="i-lucide-banknote" :loading="findPayment.isPending.value || createPayment.isPending.value" @click="openPayment">{{
          t('agreements.detail.payment')
        }}</UButton>
        <UButton v-if="canCancel" icon="i-lucide-ban" color="error" variant="soft" @click="cancelling = true">{{
          t('agreements.detail.cancel')
        }}</UButton>
      </template>
    </PlatformPageHeader>

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

        <UTabs v-model="tab" :items="tabs" :content="false" />

        <UCard v-if="tab === 'members'" :ui="{ body: 'p-0 sm:p-0' }">
          <MasterTable :caption="t('agreements.members.title')">
            <thead>
              <tr>
                <th>{{ t('agreements.member.eid') }}</th>
                <th>{{ t('agreements.member.name') }}</th>
                <th>{{ t('agreements.member.position') }}</th>
                <th>{{ t('agreements.member.rank') }}</th>
                <th>{{ t('agreements.member.dates') }}</th>
                <th class="mt-num">{{ t('agreements.member.days') }}</th>
                <th>{{ t('agreements.member.role') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in a.members" :key="m.id">
                <td class="mono">{{ m.eid }}</td>
                <td>{{ m.nameLao }} {{ m.snameLao }}</td>
                <td>
                  {{ m.positionName ?? '—' }}
                  <span v-if="m.actingPositionName" class="block text-sm text-[var(--ui-text-muted)]">{{
                    t('agreements.member.actingAs', { name: m.actingPositionName })
                  }}</span>
                </td>
                <td class="mono">{{ m.rankCode ?? '—' }}</td>
                <td class="mono whitespace-nowrap">{{ formatDayFirst(m.departureDate) }} – {{ formatDayFirst(m.returnDate) }}</td>
                <td class="mt-num">
                  {{ m.paidDays }}<span v-if="m.daysSubtracted" class="text-[var(--ui-text-muted)]">
                    / {{ m.calculatedDays }}</span
                  >
                </td>
                <td>{{ roleOf(m) || '—' }}</td>
              </tr>
            </tbody>
          </MasterTable>
        </UCard>
        <PlatformFilesAttachments
          v-else-if="tab === 'files'"
          entity-type="agreement"
          :entity-id="a.id"
          :locked="!isDraft"
        />
        <UCard v-else>
          <PlatformRecordsHistoryTimeline
            :entries="history.data.value"
            :loading="history.isPending.value"
            :error="history.error.value"
            :field-label="(f: string) => t(`agreements.field.${f}`)"
          />
        </UCard>
      </div>

      <div class="grid content-start gap-4">
        <PlatformApprovalRecordStatus
          entity-type="agreement"
          :entity-id="a.id"
          :submit-path="`/agreements/${a.id}/submit`"
          :submittable="isDraft"
          @submitted="agreement.refetch()"
        />
      </div>
    </div>

    <UModal v-model:open="cancelling" :title="t('agreements.detail.cancelTitle', { ref: a.ref })">
      <template #body>
        <p class="mb-3 text-sm text-[var(--ui-text-muted)]">{{ t('agreements.detail.cancelText') }}</p>
        <UFormField :label="t('agreements.field.cancelReason')" required>
          <UTextarea v-model="reason" class="w-full" :rows="3" maxlength="500" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="cancelling = false">{{ t('platform.actions.cancel') }}</UButton>
          <UButton color="error" :disabled="!reason.trim()" :loading="cancel.isPending.value" @click="confirmCancel">{{
            t('agreements.detail.cancel')
          }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

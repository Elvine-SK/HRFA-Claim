<script setup lang="ts">
import type { ListResponse } from '@elvine-sk/platform-core'
import { useQuery } from '@tanstack/vue-query'
import type { MemberDraft } from './MemberRow.vue'

/** Forms 1–4 (spec §8): one form whose place fields follow the form type. */
const props = defineProps<{ agreement?: Agreement; formType?: FormType }>()
const emit = defineEmits<{ saved: [agreement: Agreement] }>()

const { t } = useI18n()
const notify = useNotify()
const api = useApi()
const placeName = usePlaceName()
const localName = useLocalName()
const { create, update } = useAgreementMutations()

const a = props.agreement
const form = reactive({
  formType: (a?.formType ?? props.formType ?? 'domestic') as FormType,
  subject: a?.subject ?? '',
  title: a?.title ?? '',
  reference: a?.reference ?? '',
  docNo: a?.docNo ?? '',
  docDate: a?.docDate ?? todayLaos(),
  travelFrom: a?.travelFrom ?? '',
  travelTo: a?.travelTo ?? '',
  policyOption: (a?.policyOption ?? 'bcel_all') as PolicyOption,
  hasAdvance: a?.hasAdvance ?? false,
  fromProvinceCode: a?.fromProvinceCode ?? '',
  toProvinceCode: a?.toProvinceCode ?? '',
  provinceCode: a?.provinceCode ?? '',
  fromDistrictCode: a?.fromDistrictCode ?? '',
  toDistrictCode: a?.toDistrictCode ?? '',
  overnight: a?.overnight ?? true,
  sameDayOver50km: a?.sameDayOver50km ?? null,
  countryIso2: a?.countryIso2 ?? '',
  borderRouteId: a?.borderRouteId ?? null,
  borderRouteOther: a?.borderRouteOther ?? '',
})

const blank = (): MemberDraft => ({
  eid: '',
  departureDate: form.travelFrom,
  returnDate: form.travelTo,
  daysSubtracted: 0,
  isLeader: false,
  isDeputy: false,
  isAdvanceHolder: false,
  hostMeals: 0,
  privateCarKm: null,
  actingPositionCode: null,
})
const members = ref<MemberDraft[]>(
  a?.members.map((m) => ({
    eid: m.eid,
    departureDate: m.departureDate,
    returnDate: m.returnDate,
    daysSubtracted: m.daysSubtracted,
    isLeader: m.isLeader,
    isDeputy: m.isDeputy,
    isAdvanceHolder: m.isAdvanceHolder,
    hostMeals: m.hostMeals,
    privateCarKm: m.privateCarKm,
    actingPositionCode: m.actingPositionCode,
    actingPositionName: m.actingPositionName,
    name: `${m.nameLao} ${m.snameLao}${m.positionName ? ` · ${m.positionName}` : ''}`,
  })) ?? [{ ...blank(), isLeader: true }],
)

// Members still on the old header dates follow a change of the header dates.
watch(
  () => [form.travelFrom, form.travelTo] as const,
  ([from, to], [oldFrom, oldTo]) => {
    for (const m of members.value) {
      if (!m.departureDate || m.departureDate === oldFrom) m.departureDate = from
      if (!m.returnDate || m.returnDate === oldTo) m.returnDate = to
    }
  },
)
// A trip without an overnight stay is one day: the return date follows the departure date, whichever is set first.
watch(
  () => [form.formType, form.overnight, form.travelFrom] as const,
  ([formType, overnight, from]) => {
    if (formType === 'district' && !overnight) form.travelTo = from
  },
  { immediate: true },
)

// The radio group takes strings; the API takes a boolean, or null until answered.
const over50 = computed({
  get: () => (form.sameDayOver50km === null ? undefined : form.sameDayOver50km ? 'yes' : 'no'),
  set: (v: string | undefined) => (form.sameDayOver50km = v === undefined ? null : v === 'yes'),
})

const provinces = useProvinces()
const provinceItems = computed(() => (provinces.data.value ?? []).map((p) => ({ label: placeName(p), value: p.code })))
const districts = useDistricts(() => (form.formType === 'district' ? form.provinceCode : null))
const districtItems = computed(() => (districts.data.value ?? []).map((d) => ({ label: placeName(d), value: d.code })))
const routes = useTravelBorderRoutes()
const routeItems = computed(() => [
  ...(routes.data.value ?? []).filter((r) => r.active).map((r) => ({ label: localName(r), value: r.id as string | null })),
  { label: t('agreements.form.otherRoute'), value: null },
])
const countrySearch = ref('')
const countries = useQuery({
  queryKey: computed(() => ['agreement-countries', countrySearch.value.trim()] as const),
  queryFn: async ({ signal }) =>
    (
      await api<ListResponse<TravelCountry>>(
        `/travel-master/countries?limit=30&search=${encodeURIComponent(countrySearch.value.trim())}`,
        { signal },
      )
    ).data,
  staleTime: 60_000,
})
const countryItems = computed(() => [
  ...(countries.data.value ?? []).map((c) => ({ label: `${localName(c)} (${c.iso2} · ${c.zoneCode})`, value: c.iso2 })),
  ...(form.countryIso2 && !countries.data.value?.some((c) => c.iso2 === form.countryIso2)
    ? [{ label: form.countryIso2, value: form.countryIso2 }]
    : []),
])

const policyItems = computed(() => POLICY_OPTIONS.map((p) => ({ label: t(`agreements.policy.${p}`), value: p })))

const HEADER = [
  'subject',
  'title',
  'reference',
  'docNo',
  'docDate',
  'travelFrom',
  'travelTo',
  'policyOption',
  'fromProvinceCode',
  'toProvinceCode',
  'provinceCode',
  'fromDistrictCode',
  'toDistrictCode',
  'sameDayOver50km',
  'countryIso2',
  'borderRouteId',
  'borderRouteOther',
  'members',
] as const
const MEMBER_FIELDS = [
  'eid',
  'departureDate',
  'returnDate',
  'daysSubtracted',
  'hostMeals',
  'privateCarKm',
  'actingPositionCode',
  'isLeader',
  'isAdvanceHolder',
]
const errors = useFormErrors<string>()
const known = () => [...HEADER, ...members.value.flatMap((_, n) => MEMBER_FIELDS.map((f) => `members.${n}.${f}`))]
const saving = computed(() => create.isPending.value || update.isPending.value)

function body(): AgreementInput {
  const header = {
    subject: form.subject,
    title: form.title,
    reference: form.reference.trim() || null,
    docNo: form.docNo,
    docDate: form.docDate,
    travelFrom: form.travelFrom,
    travelTo: form.travelTo,
    policyOption: form.policyOption,
    hasAdvance: form.hasAdvance,
    members: members.value.map(({ name: _n, actingPositionName: _a, ...m }) => ({
      ...m,
      eid: m.eid.trim(),
      isAdvanceHolder: form.hasAdvance && m.isAdvanceHolder,
    })),
  }
  switch (form.formType) {
    case 'domestic':
      return { formType: 'domestic', ...header, fromProvinceCode: form.fromProvinceCode, toProvinceCode: form.toProvinceCode }
    case 'district':
      return {
        formType: 'district',
        ...header,
        provinceCode: form.provinceCode,
        fromDistrictCode: form.fromDistrictCode,
        toDistrictCode: form.toDistrictCode,
        overnight: form.overnight,
        sameDayOver50km: form.overnight ? null : form.sameDayOver50km,
      }
    case 'overseas':
      return { formType: 'overseas', ...header, countryIso2: form.countryIso2 }
    case 'border':
      return {
        formType: 'border',
        ...header,
        fromProvinceCode: form.fromProvinceCode,
        borderRouteId: form.borderRouteId,
        borderRouteOther: form.borderRouteId ? null : form.borderRouteOther.trim() || null,
      }
  }
}

async function save() {
  errors.clear()
  try {
    const saved = a
      ? await update.mutateAsync({ id: a.id, version: a.version, body: body() })
      : await create.mutateAsync(body())
    notify.success(t('agreements.form.saved', { ref: saved.ref }))
    emit('saved', saved)
  } catch (error) {
    errors.apply(error, known())
  }
}
</script>

<template>
  <form class="grid gap-4" novalidate @submit.prevent="save">
    <UAlert v-if="errors.message.value" color="error" variant="subtle" :description="errors.message.value" />

    <UCard>
      <template #header>
        <h2 class="font-medium">{{ t(`agreements.formType.${form.formType}`) }}</h2>
      </template>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="t('agreements.field.docNo')" :error="errors.fields.docNo" :hint="t('agreements.form.docNoHint')" required>
          <UInput v-model="form.docNo" class="w-full" placeholder="0001.BCEL.888010.2026" />
        </UFormField>
        <UFormField :label="t('agreements.field.docDate')" :error="errors.fields.docDate" required>
          <UInput v-model="form.docDate" type="date" class="w-full" />
        </UFormField>
        <UFormField :label="t('agreements.field.subject')" :error="errors.fields.subject" required class="sm:col-span-2">
          <UInput v-model="form.subject" class="w-full" maxlength="500" />
        </UFormField>
        <UFormField :label="t('agreements.field.title')" :error="errors.fields.title" required class="sm:col-span-2">
          <UTextarea v-model="form.title" class="w-full" :rows="2" maxlength="500" />
        </UFormField>
        <UFormField :label="t('agreements.field.reference')" :error="errors.fields.reference" class="sm:col-span-2">
          <UInput v-model="form.reference" class="w-full" maxlength="200" />
        </UFormField>
        <UFormField :label="t('agreements.field.travelFrom')" :error="errors.fields.travelFrom" required>
          <UInput v-model="form.travelFrom" type="date" class="w-full" />
        </UFormField>
        <UFormField :label="t('agreements.field.travelTo')" :error="errors.fields.travelTo" required>
          <UInput v-model="form.travelTo" type="date" class="w-full" :disabled="form.formType === 'district' && !form.overnight" />
        </UFormField>

        <template v-if="form.formType === 'domestic' || form.formType === 'border'">
          <UFormField :label="t('agreements.field.fromProvince')" :error="errors.fields.fromProvinceCode" required>
            <USelect v-model="form.fromProvinceCode" :items="provinceItems" class="w-full" />
          </UFormField>
        </template>
        <UFormField
          v-if="form.formType === 'domestic'"
          :label="t('agreements.field.toProvince')"
          :error="errors.fields.toProvinceCode"
          required
        >
          <USelect v-model="form.toProvinceCode" :items="provinceItems" class="w-full" />
        </UFormField>

        <template v-if="form.formType === 'district'">
          <UFormField :label="t('agreements.field.province')" :error="errors.fields.provinceCode" required class="sm:col-span-2">
            <USelect v-model="form.provinceCode" :items="provinceItems" class="w-full" />
          </UFormField>
          <UFormField :label="t('agreements.field.fromDistrict')" :error="errors.fields.fromDistrictCode" required>
            <USelect v-model="form.fromDistrictCode" :items="districtItems" class="w-full" :disabled="!form.provinceCode" />
          </UFormField>
          <UFormField :label="t('agreements.field.toDistrict')" :error="errors.fields.toDistrictCode" required>
            <USelect v-model="form.toDistrictCode" :items="districtItems" class="w-full" :disabled="!form.provinceCode" />
          </UFormField>
          <UCheckbox v-model="form.overnight" :label="t('agreements.field.overnight')" />
          <UFormField
            v-if="!form.overnight"
            :label="t('agreements.field.sameDayOver50km')"
            :error="errors.fields.sameDayOver50km"
            required
          >
            <URadioGroup
              v-model="over50"
              orientation="horizontal"
              :items="[
                { label: t('agreements.form.yes'), value: 'yes' },
                { label: t('agreements.form.no'), value: 'no' },
              ]"
            />
          </UFormField>
        </template>

        <UFormField
          v-if="form.formType === 'overseas'"
          :label="t('agreements.field.country')"
          :error="errors.fields.countryIso2"
          :hint="t('agreements.form.oneCountry')"
          required
          class="sm:col-span-2"
        >
          <USelectMenu
            v-model="form.countryIso2"
            v-model:search-term="countrySearch"
            :items="countryItems"
            value-key="value"
            ignore-filter
            class="w-full"
          />
        </UFormField>

        <template v-if="form.formType === 'border'">
          <UFormField :label="t('agreements.field.borderRoute')" :error="errors.fields.borderRouteId" required>
            <USelect v-model="form.borderRouteId" :items="routeItems" class="w-full" />
          </UFormField>
          <UFormField
            v-if="!form.borderRouteId"
            :label="t('agreements.field.borderRouteOther')"
            :error="errors.fields.borderRouteOther"
            required
            class="sm:col-span-2"
          >
            <UInput v-model="form.borderRouteOther" class="w-full" maxlength="200" />
          </UFormField>
        </template>

        <UFormField :label="t('agreements.field.policy')" :error="errors.fields.policyOption" required class="sm:col-span-2">
          <USelect v-model="form.policyOption" :items="policyItems" class="w-full" />
        </UFormField>
        <UCheckbox v-model="form.hasAdvance" :label="t('agreements.field.hasAdvance')" class="sm:col-span-2" />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-medium">{{ t('agreements.members.title') }}</h2>
          <UButton size="sm" icon="i-lucide-user-plus" variant="soft" @click="members.push(blank())">{{
            t('agreements.members.add')
          }}</UButton>
        </div>
      </template>
      <p v-if="errors.fields.members" class="mb-3 text-sm text-[var(--ui-error)]">{{ errors.fields.members }}</p>
      <div class="grid gap-3">
        <AgreementsMemberRow
          v-for="(m, n) in members"
          :key="n"
          v-model="members[n]!"
          :index="n"
          :has-advance="form.hasAdvance"
          :errors="errors.fields"
          @remove="members.splice(n, 1)"
        />
      </div>
    </UCard>

    <div class="flex justify-end gap-2">
      <slot name="actions" />
      <UButton type="submit" :loading="saving" icon="i-lucide-save">{{ t('agreements.form.saveDraft') }}</UButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'

/** One member of an agreement on the form: EID typed, name from HRM, own dates, roles and the per-member inputs. */
export interface MemberDraft {
  eid: string
  departureDate: string
  returnDate: string
  daysSubtracted: number
  isLeader: boolean
  isDeputy: boolean
  isAdvanceHolder: boolean
  hostMeals: number
  privateCarKm: number | null
  actingPositionCode: string | null
  /** Shown only: filled from HRM. */
  name?: string
  actingPositionName?: string | null
}

const props = defineProps<{
  index: number
  hasAdvance: boolean
  errors: Partial<Record<string, string>>
}>()
const member = defineModel<MemberDraft>({ required: true })
const emit = defineEmits<{ remove: [] }>()
const { t } = useI18n()
const api = useApi()

const err = (field: string) => props.errors[`members.${props.index}.${field}`]
const calculated = computed(() => daysInclusive(member.value.departureDate, member.value.returnDate))
const paid = computed(() => (calculated.value === null ? null : calculated.value - (member.value.daysSubtracted || 0)))

async function lookUp() {
  const eid = member.value.eid.trim()
  member.value.name = undefined
  if (!/^\d{5}$/.test(eid)) return
  try {
    const e = (await api<DataResponse<{ nameLao: string; snameLao: string; positionName: string | null }>>(`/hrm/employees/${eid}`))
      .data
    member.value.name = `${e.nameLao} ${e.snameLao}${e.positionName ? ` · ${e.positionName}` : ''}`
  } catch {
    member.value.name = t('agreements.form.notFound')
  }
}
onMounted(() => {
  if (member.value.eid && !member.value.name) void lookUp()
})

const positionSearch = ref('')
const positions = usePositions(positionSearch)
const positionItems = computed(() => [
  { label: t('agreements.form.noActing'), value: null },
  ...(positions.data.value ?? []).map((p) => ({ label: `${p.name} (${p.code})`, value: p.code })),
  ...(member.value.actingPositionCode && !positions.data.value?.some((p) => p.code === member.value.actingPositionCode)
    ? [{ label: member.value.actingPositionName ?? member.value.actingPositionCode, value: member.value.actingPositionCode }]
    : []),
])
</script>

<template>
  <div class="member grid gap-3 rounded-md border border-[var(--ui-border)] p-3">
    <div class="flex flex-wrap items-end gap-3">
      <UFormField :label="t('agreements.member.eid')" :error="err('eid')" required class="w-28">
        <UInput v-model="member.eid" inputmode="numeric" maxlength="5" class="w-full" @blur="lookUp" />
      </UFormField>
      <p class="min-w-0 flex-1 truncate pb-2 text-sm text-[var(--ui-text-muted)]">{{ member.name ?? '' }}</p>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        :aria-label="t('agreements.member.remove')"
        @click="emit('remove')"
      />
    </div>
    <div class="grid gap-3 sm:grid-cols-4">
      <UFormField :label="t('agreements.member.departure')" :error="err('departureDate')">
        <AppDateInput v-model="member.departureDate" />
      </UFormField>
      <UFormField :label="t('agreements.member.return')" :error="err('returnDate')">
        <AppDateInput v-model="member.returnDate" />
      </UFormField>
      <UFormField :label="t('agreements.member.daysSubtracted')" :error="err('daysSubtracted')">
        <UInput v-model.number="member.daysSubtracted" type="number" min="0" class="w-full" />
      </UFormField>
      <div class="pb-2 text-sm">
        <p class="text-[var(--ui-text-muted)]">{{ t('agreements.member.days') }}</p>
        <p class="mono">{{ calculated ?? '—' }} → {{ paid ?? '—' }}</p>
      </div>
    </div>
    <div class="grid gap-3 sm:grid-cols-3">
      <UFormField :label="t('agreements.member.hostMeals')" :error="err('hostMeals')">
        <UInput v-model.number="member.hostMeals" type="number" min="0" class="w-full" />
      </UFormField>
      <UFormField :label="t('agreements.member.privateCarKm')" :error="err('privateCarKm')">
        <UInput
          :model-value="member.privateCarKm ?? undefined"
          type="number"
          min="1"
          class="w-full"
          @update:model-value="(v) => (member.privateCarKm = v ? Number(v) : null)"
        />
      </UFormField>
      <UFormField :label="t('agreements.member.acting')" :error="err('actingPositionCode')" :hint="t('agreements.member.actingHint')">
        <USelectMenu
          v-model="member.actingPositionCode"
          v-model:search-term="positionSearch"
          :items="positionItems"
          value-key="value"
          ignore-filter
          class="w-full"
        />
      </UFormField>
    </div>
    <div class="flex flex-wrap gap-5">
      <UCheckbox v-model="member.isLeader" :label="t('agreements.member.leader')" />
      <UCheckbox v-model="member.isDeputy" :label="t('agreements.member.deputy')" />
      <UCheckbox
        v-if="hasAdvance"
        v-model="member.isAdvanceHolder"
        :label="t('agreements.member.holder')"
        :color="err('isAdvanceHolder') ? 'error' : 'primary'"
      />
    </div>
    <p v-if="err('isLeader') || err('isAdvanceHolder')" class="text-sm text-[var(--ui-error)]">
      {{ err('isLeader') ?? err('isAdvanceHolder') }}
    </p>
  </div>
</template>

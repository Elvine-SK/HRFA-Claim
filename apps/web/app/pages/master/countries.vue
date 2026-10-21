<script setup lang="ts">
import type { DataTableColumn } from '~/components/platform/DataTable.vue'

definePageMeta({ title: 'master.countries.title' })

const { t } = useI18n()
const access = useAccess()
const notify = useNotify()
const canManage = computed(() => access.canSome('travel_master.manage'))

const list = useListQuery({ defaults: { sort: [{ field: 'nameEn', dir: 'asc' }] } })
const countries = useApiList<TravelCountry>(TRAVEL_MASTER_KEY, '/travel-master/countries', list)
const zones = useTravelZones()
const localName = useLocalName()
const { createCountry, updateCountry } = useTravelMasterMutations()

const columns = computed<DataTableColumn<TravelCountry>[]>(() => [
  { key: 'iso2', label: t('master.countries.iso2'), sortable: true, mono: true, locked: true },
  { key: 'nameEn', label: t('master.nameEn'), sortable: true, primary: true },
  { key: 'nameLo', label: t('master.nameLo'), sortable: true, card: true },
  { key: 'zoneCode', label: t('master.countries.zone'), sortable: true, mono: true, card: true },
])
const zoneLabels = computed(() =>
  Object.fromEntries((zones.data.value ?? []).map((z) => [z.code, `${z.code} · ${localName(z)}`])),
)
const filterLabels = computed(() => ({ zoneCode: t('master.countries.zone') }))
const zoneItems = computed(() =>
  (zones.data.value ?? []).map((z) => ({ label: `${z.code} · ${localName(z)}`, value: z.code })),
)

const open = ref(false)
const editing = ref<TravelCountry | null>(null)
const form = reactive({ iso2: '', nameEn: '', nameLo: '', zoneCode: '' })
const errors = useFormErrors<'iso2' | 'nameEn' | 'nameLo' | 'zoneCode'>()
const saving = computed(() => createCountry.isPending.value || updateCountry.isPending.value)

function openDialog(country: TravelCountry | null) {
  editing.value = country
  Object.assign(form, {
    iso2: country?.iso2 ?? '',
    nameEn: country?.nameEn ?? '',
    nameLo: country?.nameLo ?? '',
    zoneCode: country?.zoneCode ?? '',
  })
  errors.clear()
  open.value = true
}

function onSelect(country: TravelCountry) {
  if (canManage.value) openDialog(country)
}

async function save() {
  errors.clear()
  if (!editing.value && !/^[A-Za-z]{2}$/.test(form.iso2)) errors.fields.iso2 = t('master.countries.iso2Invalid')
  if (!form.nameEn.trim()) errors.fields.nameEn = t('master.required')
  if (!form.nameLo.trim()) errors.fields.nameLo = t('master.required')
  if (!form.zoneCode) errors.fields.zoneCode = t('master.required')
  if (Object.keys(errors.fields).length) return
  const names = { nameEn: form.nameEn.trim(), nameLo: form.nameLo.trim(), zoneCode: form.zoneCode }
  try {
    if (editing.value) {
      await updateCountry.mutateAsync({ id: editing.value.id, patch: { version: editing.value.version, ...names } })
    } else {
      await createCountry.mutateAsync({ iso2: form.iso2.trim(), ...names })
    }
    open.value = false
    notify.success(t('master.saved'))
  } catch (error) {
    errors.apply(error, ['iso2', 'nameEn', 'nameLo', 'zoneCode'])
  }
}
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('master.countries.title')" :subtitle="t('master.countries.line')">
      <template v-if="canManage" #actions>
        <UButton icon="i-lucide-plus" @click="openDialog(null)">{{ t('master.countries.add') }}</UButton>
      </template>
    </PlatformPageHeader>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        id="travel-countries"
        :rows="countries.data.value?.data ?? []"
        :total="countries.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="travel_countries"
        :filter-labels="filterLabels"
        :filter-value-labels="{ zoneCode: zoneLabels }"
        :loading="countries.isPending.value"
        :fetching="countries.isFetching.value"
        :error="countries.error.value"
        :entities="t('master.countries.entities')"
        :caption="t('master.countries.title')"
        @select="onSelect"
        @retry="countries.refetch()"
      />
    </UCard>

    <UModal v-model:open="open" :title="editing ? t('master.countries.edit') : t('master.countries.add')">
      <template #body>
        <form id="country-form" class="grid gap-4" novalidate @submit.prevent="save">
          <UAlert v-if="errors.message.value" color="error" variant="subtle" :description="errors.message.value" />
          <UFormField :label="t('master.countries.iso2')" :error="errors.fields.iso2" required>
            <UInput
              v-model="form.iso2"
              class="w-full"
              maxlength="2"
              :disabled="!!editing"
              :ui="{ base: 'font-mono uppercase' }"
            />
          </UFormField>
          <UFormField :label="t('master.nameEn')" :error="errors.fields.nameEn" required>
            <UInput v-model="form.nameEn" class="w-full" maxlength="200" />
          </UFormField>
          <UFormField :label="t('master.nameLo')" :error="errors.fields.nameLo" required>
            <UInput v-model="form.nameLo" class="w-full" maxlength="200" />
          </UFormField>
          <UFormField :label="t('master.countries.zone')" :error="errors.fields.zoneCode" required>
            <USelect v-model="form.zoneCode" :items="zoneItems" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">{{ t('platform.actions.cancel') }}</UButton>
          <UButton type="submit" form="country-form" :loading="saving">{{ t('platform.actions.save') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

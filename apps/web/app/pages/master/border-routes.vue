<script setup lang="ts">
definePageMeta({ title: 'master.borderRoutes.title' })

const { t } = useI18n()
const access = useAccess()
const notify = useNotify()
const canManage = computed(() => access.canSome('travel_master.manage'))

const routes = useTravelBorderRoutes()
const { createBorderRoute, updateBorderRoute } = useTravelMasterMutations()

const open = ref(false)
const editing = ref<TravelBorderRoute | null>(null)
const form = reactive({ nameEn: '', nameLo: '' })
const errors = useFormErrors<'nameEn' | 'nameLo'>()
const saving = computed(() => createBorderRoute.isPending.value || updateBorderRoute.isPending.value)

function openDialog(route: TravelBorderRoute | null) {
  editing.value = route
  Object.assign(form, { nameEn: route?.nameEn ?? '', nameLo: route?.nameLo ?? '' })
  errors.clear()
  open.value = true
}

async function save() {
  errors.clear()
  if (!form.nameEn.trim()) errors.fields.nameEn = t('master.required')
  if (!form.nameLo.trim()) errors.fields.nameLo = t('master.required')
  if (Object.keys(errors.fields).length) return
  const names = { nameEn: form.nameEn.trim(), nameLo: form.nameLo.trim() }
  try {
    if (editing.value) {
      await updateBorderRoute.mutateAsync({ id: editing.value.id, patch: { version: editing.value.version, ...names } })
    } else {
      await createBorderRoute.mutateAsync(names)
    }
    open.value = false
    notify.success(t('master.saved'))
  } catch (error) {
    errors.apply(error, ['nameEn', 'nameLo'])
  }
}

async function toggle(route: TravelBorderRoute) {
  try {
    await updateBorderRoute.mutateAsync({ id: route.id, patch: { version: route.version, active: !route.active } })
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('master.borderRoutes.title')" :subtitle="t('master.borderRoutes.line')">
      <template v-if="canManage" #actions>
        <UButton icon="i-lucide-plus" @click="openDialog(null)">{{ t('master.borderRoutes.add') }}</UButton>
      </template>
    </PlatformPageHeader>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <USkeleton v-if="routes.isPending.value" class="h-48" />
      <UAlert
        v-else-if="routes.error.value"
        color="error"
        variant="subtle"
        :title="notify.messageOf(routes.error.value)"
      />
      <MasterTable v-else :caption="t('master.borderRoutes.title')">
        <thead>
          <tr>
            <th>{{ t('master.nameEn') }}</th>
            <th>{{ t('master.nameLo') }}</th>
            <th>{{ t('master.borderRoutes.status') }}</th>
            <th v-if="canManage">
              <span class="sr-only">{{ t('platform.actions.more') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="route in routes.data.value" :key="route.id">
            <td>{{ route.nameEn }}</td>
            <td>{{ route.nameLo }}</td>
            <td>
              <UBadge :color="route.active ? 'success' : 'neutral'" variant="subtle">{{
                route.active ? t('master.borderRoutes.active') : t('master.borderRoutes.inactive')
              }}</UBadge>
            </td>
            <td v-if="canManage" class="whitespace-nowrap text-end">
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-pencil" @click="openDialog(route)">{{
                t('platform.actions.edit')
              }}</UButton>
              <UButton size="sm" color="neutral" variant="ghost" @click="toggle(route)">{{
                route.active ? t('master.borderRoutes.deactivate') : t('master.borderRoutes.activate')
              }}</UButton>
            </td>
          </tr>
        </tbody>
      </MasterTable>
    </UCard>

    <UModal v-model:open="open" :title="editing ? t('master.borderRoutes.edit') : t('master.borderRoutes.add')">
      <template #body>
        <form id="route-form" class="grid gap-4" novalidate @submit.prevent="save">
          <UAlert v-if="errors.message.value" color="error" variant="subtle" :description="errors.message.value" />
          <UFormField :label="t('master.nameEn')" :error="errors.fields.nameEn" required>
            <UInput v-model="form.nameEn" class="w-full" maxlength="200" />
          </UFormField>
          <UFormField :label="t('master.nameLo')" :error="errors.fields.nameLo" required>
            <UInput v-model="form.nameLo" class="w-full" maxlength="200" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">{{ t('platform.actions.cancel') }}</UButton>
          <UButton type="submit" form="route-form" :loading="saving">{{ t('platform.actions.save') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

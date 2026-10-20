<script setup lang="ts">
/** A user id in a filter chip, shown as the person's name when the reader may look users up. */
import type { UserAdmin } from '../../types/platform'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const access = useAccess()
const user = useApiItem<UserAdmin>(ADMIN_KEY, () => (access.can('user.read') ? `/users/${props.id}` : null))
</script>

<template>
  <span>{{ user.data.value?.displayName ?? t('lists.filter.someone', { id: id.slice(0, 8) }) }}</span>
</template>

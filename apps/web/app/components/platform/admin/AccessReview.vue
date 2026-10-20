<script setup lang="ts">
import type { RoleDetail } from '../../../types/platform'

/** The matrix's unsaved grants and revocations per role, checked before they are saved. */
const props = defineProps<{ roles: RoleDetail[]; draft: Record<string, string[]>; saving?: boolean }>()
const emit = defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()

const sections = computed(() => {
  const byId = new Map(props.roles.map((r) => [r.id, r]))
  return accessChanges(props.roles, props.draft).map((c) => ({ ...c, role: byId.get(c.roleId)! }))
})
const total = computed(() => sections.value.reduce((n, s) => n + s.added.length + s.removed.length, 0))
const sensitive = computed(() => sensitiveKeys(sections.value))
const understood = ref(false)
watch(open, (isOpen) => {
  if (isOpen) understood.value = false
})

function reach(role: RoleDetail) {
  const { users, groups } = role.reach
  const people = t('admin.roles.review.users', { n: users }, users)
  const who = groups ? `${people} + ${t('admin.roles.review.groups', { n: groups }, groups)}` : people
  return t('admin.roles.review.affected', { who })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('admin.roles.review.title')"
    :description="t('admin.roles.review.text')"
    :ui="{ content: 'sm:max-w-2xl' }"
    :dismissible="!saving"
    :close="!saving"
  >
    <template #body>
      <div class="grid gap-4">
        <div v-if="sensitive.length" class="ar-risk" role="alert">
          <UIcon name="i-lucide-triangle-alert" class="ar-risk-i size-4" />
          <!-- Nodes are joined with `><`: whitespace between them would show before the period. -->
          <p>
            <b>{{ t('admin.roles.review.sensitiveCount', { n: sensitive.length }, sensitive.length) }}</b
            ><template v-for="(key, i) in sensitive" :key="key"
              >{{ i ? ', ' : ' ' }}<code>{{ key }}</code></template
            >{{ `. ${t('admin.roles.review.risk')}` }}
          </p>
        </div>
        <UCheckbox v-if="sensitive.length" v-model="understood" :label="t('admin.roles.review.understand')" />
        <section v-for="s in sections" :key="s.roleId" class="ar-role" :data-testid="`review-${s.role.key}`">
          <h3>
            <span>{{ s.role.name }}</span>
            <small>{{ reach(s.role) }}</small>
          </h3>
          <ul>
            <li v-for="key in s.added" :key="`+${key}`" class="ar-i ar-add">
              <b aria-hidden="true">+</b>
              <code>{{ key }}</code>
              <span class="muted">{{ t('admin.roles.review.granted') }}</span>
              <UBadge v-if="isSensitivePermission(key)" color="error" variant="subtle" size="sm">
                {{ t('admin.roles.review.sensitive') }}
              </UBadge>
            </li>
            <li v-for="key in s.removed" :key="`-${key}`" class="ar-i ar-rm">
              <b aria-hidden="true">−</b>
              <code>{{ key }}</code>
              <span class="muted">{{ t('admin.roles.review.revoked') }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :disabled="saving" @click="open = false">
          {{ t('admin.roles.review.keepEditing') }}
        </UButton>
        <UButton
          icon="i-lucide-check"
          :loading="saving"
          :disabled="!total || (sensitive.length > 0 && !understood)"
          @click="emit('confirm')"
        >
          {{ t('admin.roles.review.save', { n: total }, total) }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.ar-risk {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--app-bad) 30%, transparent);
  border-radius: var(--app-r-sm);
  background: color-mix(in oklab, var(--app-bad) 7%, var(--app-surface));
  font-size: 12.5px;
  line-height: 1.5;
}
.ar-risk-i {
  flex: none;
  margin-top: 2px;
  color: var(--app-bad);
}
.ar-role h3 {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13.5px;
  font-weight: 600;
}
.ar-role h3 small {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 400;
}
.ar-i {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 3px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12.5px;
}
.ar-i > b {
  width: 14px;
  text-align: center;
}
.ar-add {
  background: color-mix(in oklab, var(--app-ok) 9%, transparent);
}
.ar-add > b {
  color: var(--app-ok);
}
.ar-rm {
  background: color-mix(in oklab, var(--app-bad) 8%, transparent);
}
.ar-rm > b {
  color: var(--app-bad);
}
</style>

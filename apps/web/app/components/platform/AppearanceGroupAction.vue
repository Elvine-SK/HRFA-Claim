<script setup lang="ts">
import type { LockableField } from '@elvine-sk/platform-nuxt/utils'

/**
 * The control beside one appearance setting. For a person: "Workspace default" (pressed while they follow
 * the workspace; pressing it drops their override) or a lock note. For the workspace: the lock itself.
 */
const props = defineProps<{ group: LockableField; scope: 'personal' | 'workspace' }>()
const { t } = useI18n()
const theme = useTheme()
const locked = computed(() => theme.isLocked(props.group))
</script>

<template>
  <button
    v-if="scope === 'workspace'"
    type="button"
    class="chip"
    :aria-pressed="locked"
    :title="t('appearance.lockHint')"
    @click="theme.toggleLock(group)"
  >
    <UIcon :name="locked ? 'i-lucide-lock' : 'i-lucide-lock-open'" class="size-3.5" />
    {{ locked ? t('appearance.lockedForAll') : t('appearance.lock') }}
  </button>
  <span v-else-if="locked" class="chip note">
    <UIcon name="i-lucide-lock" class="size-3.5" />{{ t('appearance.locked') }}
  </span>
  <button v-else type="button" class="chip" :aria-pressed="theme.inherits(group)" @click="theme.clear(group)">
    {{ t('appearance.workspaceDefault') }}
  </button>
</template>

<style scoped>
.chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-muted);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
}
.chip:hover {
  color: var(--app-text);
}
.chip[aria-pressed='true'] {
  border-color: color-mix(in oklab, var(--app-accent) 45%, var(--app-border));
  background: color-mix(in oklab, var(--app-accent) 12%, transparent);
  color: var(--app-text);
}
.chip.note {
  cursor: default;
}
</style>

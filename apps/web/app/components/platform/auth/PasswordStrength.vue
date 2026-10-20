<script setup lang="ts">
const props = defineProps<{ password: string; email?: string | null; name?: string | null }>()
const { t } = useI18n()

const context = computed(() => ({ email: props.email, name: props.name }))
const score = computed(() => passwordScore(props.password, context.value))
const checks = computed(() => passwordChecks(props.password, context.value))
const rules = computed(() => [
  { key: 'length', ok: checks.value.length, label: t('auth.password.ruleLength', { n: PASSWORD_MIN }) },
  { key: 'common', ok: checks.value.notCommon, label: t('auth.password.ruleCommon') },
  { key: 'personal', ok: checks.value.notPersonal, label: t('auth.password.rulePersonal') },
])
const scoreLabel = computed(() => (props.password ? t(`auth.password.score${score.value}`) : ''))
</script>

<template>
  <div class="pw-strength">
    <div class="strength" :data-s="password ? score : 0" aria-hidden="true">
      <i v-for="n in 4" :key="n" />
    </div>
    <p class="score" aria-live="polite">
      <span v-if="scoreLabel"
        >{{ t('auth.password.strength') }}: <b>{{ scoreLabel }}</b></span
      >
    </p>
    <ul class="rules">
      <li v-for="rule in rules" :key="rule.key" :class="{ ok: rule.ok && password }">
        <UIcon name="i-lucide-check" class="ico" aria-hidden="true" />
        <span>{{ rule.label }}</span>
        <span class="sr-only">{{
          rule.ok && password ? t('auth.password.met') : t('auth.password.notMet')
        }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.strength {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin-top: 8px;
}
.strength i {
  height: 5px;
  border-radius: 9px;
  background: var(--app-surface-2);
  transition: background-color var(--app-dur-base);
}
.strength[data-s='1'] i:nth-child(-n + 1) {
  background: var(--app-bad);
}
.strength[data-s='2'] i:nth-child(-n + 2) {
  background: var(--app-warn);
}
.strength[data-s='3'] i:nth-child(-n + 3) {
  background: var(--app-info);
}
.strength[data-s='4'] i {
  background: var(--app-ok);
}
.score {
  min-height: 18px;
  margin: 6px 0 8px;
  color: var(--app-muted);
  font-size: 12px;
}
.score b {
  color: var(--app-text);
}
.rules {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  color: var(--app-muted);
  font-size: 12.5px;
  list-style: none;
}
.rules li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.45;
}
.rules .ico {
  width: 16px;
  height: 16px;
  flex: none;
  margin-top: 1px;
  padding: 3px;
  border-radius: 50%;
  background: var(--app-surface-2);
  color: transparent;
  transition: all var(--app-dur-base);
}
.rules li.ok {
  color: var(--app-text);
}
.rules li.ok .ico {
  background: var(--app-ok);
  color: #fff;
}
</style>

<script setup lang="ts">
import type { CaptchaChallenge } from '@elvine-sk/platform-nuxt/utils'

/** The bot check the API asked for; `v-model` is its token, cleared when it expires or is used. */
const props = defineProps<{ challenge: CaptchaChallenge }>()
const token = defineModel<string | null>({ default: null })

interface Widgets {
  render(el: HTMLElement, options: Record<string, unknown>): string
  reset(id?: string): void
  remove?(id?: string): void
}
declare global {
  interface Window {
    turnstile?: Widgets
    hcaptcha?: Widgets
  }
}

const { t, locale } = useI18n()
const captcha = useCaptcha()
const box = ref<HTMLElement>()
const failed = ref(false)
const ready = ref(false)
let widgetId: string | undefined

const widgets = () => (props.challenge.provider === 'turnstile' ? window.turnstile : window.hcaptcha)

async function mount() {
  failed.value = false
  token.value = null
  try {
    await captcha.load(props.challenge.provider)
    ready.value = true
    if (props.challenge.provider === 'altcha') return
    await nextTick()
    const api = widgets()
    if (!api || !box.value) throw new Error('captcha script did not start')
    widgetId = api.render(box.value, {
      sitekey: props.challenge.siteKey,
      language: locale.value,
      hl: locale.value,
      callback: (value: string) => (token.value = value),
      'expired-callback': () => (token.value = null),
      'error-callback': () => (token.value = null),
    })
  } catch {
    failed.value = true
  }
}

/** A token is good for one try: the page calls this after each attempt. */
function reset() {
  token.value = null
  if (props.challenge.provider !== 'altcha' && widgetId !== undefined) widgets()?.reset(widgetId)
  else altchaKey.value++
}
defineExpose({ reset })

const altchaKey = ref(0)
function onAltchaState(event: Event) {
  const detail = (event as CustomEvent<{ state: string; payload?: string }>).detail
  token.value = detail.state === 'verified' && detail.payload ? detail.payload : null
}

onMounted(mount)
onBeforeUnmount(() => {
  if (props.challenge.provider !== 'altcha' && widgetId !== undefined) widgets()?.remove?.(widgetId)
})
</script>

<template>
  <div class="captcha" data-testid="captcha">
    <p class="captcha-hint">{{ t('auth.captcha.prompt') }}</p>
    <UAlert
      v-if="failed"
      color="error"
      variant="subtle"
      icon="i-lucide-shield-alert"
      :description="t('auth.captcha.unavailable')"
      :actions="[
        {
          label: t('platform.actions.retry'),
          color: 'error',
          variant: 'outline',
          size: 'xs',
          onClick: mount,
        },
      ]"
    />
    <altcha-widget
      v-else-if="challenge.provider === 'altcha' && ready"
      :key="altchaKey"
      :challenge="captcha.challengeUrl"
      auto="onload"
      hidefooter
      @statechange="onAltchaState"
    />
    <div v-else ref="box" />
  </div>
</template>

<style scoped>
.captcha {
  display: grid;
  gap: 8px;
}
.captcha-hint {
  color: var(--ui-text-muted);
  font-size: 12.5px;
}
</style>

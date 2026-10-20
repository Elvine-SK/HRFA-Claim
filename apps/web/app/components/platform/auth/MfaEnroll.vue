<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'
import type { SessionInfo } from '@elvine-sk/platform-nuxt/utils'
import { useNow } from '@vueuse/core'
import { renderSVG } from 'uqr'

const props = withDefaults(
  defineProps<{ requirePassword?: boolean; available?: ('totp' | 'email')[]; cancellable?: boolean }>(),
  { requirePassword: false, available: () => ['totp', 'email'], cancellable: false },
)
const emit = defineEmits<{ done: [session: SessionInfo]; cancel: [] }>()

interface EnrollResult {
  recoveryCodes: string[] | null
  session: SessionInfo
}

const { t } = useI18n()
const api = useApi()
const errors = useFormErrors<'code' | 'password'>()

const method = ref<'totp' | 'email' | null>(props.available.length === 1 ? props.available[0]! : null)
const totp = ref<{ secret: string; otpauthUrl: string } | null>(null)
const code = ref('')
const password = ref('')
const busy = ref(false)
const sentAt = ref<number | null>(null)
const now = useNow({ interval: 1000 })
const result = ref<EnrollResult | null>(null)
const acknowledged = ref(false)

const qr = computed(() => (totp.value ? renderSVG(totp.value.otpauthUrl, { border: 1 }) : ''))
const resendIn = computed(() =>
  sentAt.value ? Math.max(0, 30 - Math.floor((now.value.getTime() - sentAt.value) / 1000)) : 0,
)
const canSubmit = computed(
  () => code.value.length === 6 && (!props.requirePassword || password.value.length > 0),
)

async function start(choice: 'totp' | 'email') {
  method.value = choice
  code.value = ''
  errors.clear()
  busy.value = true
  try {
    if (choice === 'totp') {
      const { data } = await api<DataResponse<{ secret: string; otpauthUrl: string }>>(
        '/auth/mfa/totp/setup',
        {
          method: 'POST',
        },
      )
      totp.value = data
    } else {
      await api('/auth/mfa/email/send', { method: 'POST' })
      sentAt.value = Date.now()
    }
  } catch (error) {
    errors.apply(error)
  } finally {
    busy.value = false
  }
}

if (method.value) void start(method.value)

async function confirm() {
  if (!canSubmit.value || !method.value) return
  busy.value = true
  errors.clear()
  try {
    const path = method.value === 'totp' ? '/auth/mfa/totp/confirm' : '/auth/mfa/email/enable'
    const body = { code: code.value, ...(props.requirePassword ? { password: password.value } : {}) }
    const { data } = await api<DataResponse<EnrollResult>>(path, { method: 'POST', body })
    if (data.recoveryCodes?.length) result.value = data
    else emit('done', data.session)
  } catch (error) {
    errors.apply(error, ['code', 'password'])
    code.value = ''
  } finally {
    busy.value = false
  }
}

async function copySecret() {
  if (!totp.value) return
  await navigator.clipboard.writeText(totp.value.secret)
}
</script>

<template>
  <div class="enroll">
    <template v-if="result">
      <h2 class="h2">{{ t('auth.recovery.title') }}</h2>
      <p class="muted">{{ t('auth.recovery.text') }}</p>
      <PlatformAuthRecoveryCodes v-model:acknowledged="acknowledged" :codes="result.recoveryCodes ?? []" />
      <UButton size="xl" block :disabled="!acknowledged" @click="emit('done', result.session)">
        {{ t('platform.actions.continue') }}
      </UButton>
    </template>

    <template v-else-if="!method">
      <div class="pick">
        <button
          v-for="choice in available"
          :key="choice"
          type="button"
          class="pick-item"
          @click="start(choice)"
        >
          <UIcon
            :name="choice === 'totp' ? 'i-lucide-smartphone' : 'i-lucide-mail'"
            class="size-5 text-[var(--app-accent)]"
          />
          <b>{{ t(`auth.mfa.method.${choice}`) }}</b>
          <small>{{ t(`auth.enroll.${choice}Hint`) }}</small>
        </button>
      </div>
      <UButton v-if="cancellable" color="neutral" variant="ghost" @click="emit('cancel')">
        {{ t('platform.actions.cancel') }}
      </UButton>
    </template>

    <form v-else class="grid gap-4" @submit.prevent="confirm">
      <UAlert
        v-if="errors.message.value"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="errors.message.value"
        role="alert"
      />

      <template v-if="method === 'totp'">
        <ol class="steps">
          <li>{{ t('auth.enroll.totpStep1') }}</li>
          <li>{{ t('auth.enroll.totpStep2') }}</li>
        </ol>
        <div class="qr-row">
          <div v-if="qr" class="qr" role="img" :aria-label="t('auth.enroll.qrLabel')" v-html="qr" />
          <USkeleton v-else class="qr" />
          <div class="secret">
            <span class="eyebrow">{{ t('auth.enroll.manual') }}</span>
            <code class="mono">{{ totp ? formatSecret(totp.secret) : '…' }}</code>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-copy"
              :disabled="!totp"
              @click="copySecret"
            >
              {{ t('platform.actions.copy') }}
            </UButton>
          </div>
        </div>
      </template>
      <p v-else class="muted">
        {{ t('auth.enroll.emailSent') }}
        <UButton
          variant="link"
          size="sm"
          class="px-0"
          :disabled="resendIn > 0 || busy"
          @click="start('email')"
        >
          {{ resendIn > 0 ? t('auth.mfa.resendIn', { s: resendIn }) : t('auth.mfa.resend') }}
        </UButton>
      </p>

      <UFormField :label="t('auth.mfa.codeLabel')" :error="errors.fields.code">
        <PlatformAuthCodeInput
          v-model="code"
          :label="t('auth.mfa.codeLabel')"
          :invalid="!!errors.fields.code"
          :disabled="busy"
          :autofocus="method === 'email'"
          @complete="requirePassword ? undefined : confirm()"
        />
      </UFormField>
      <UFormField
        v-if="requirePassword"
        :label="t('auth.fields.currentPassword')"
        :error="errors.fields.password"
        :hint="t('auth.enroll.passwordHint')"
      >
        <PlatformAuthPasswordInput v-model="password" :invalid="!!errors.fields.password" />
      </UFormField>
      <div class="flex gap-2">
        <UButton type="submit" size="lg" :loading="busy" :disabled="!canSubmit" class="flex-1 justify-center">
          {{ t('auth.enroll.confirm') }}
        </UButton>
        <UButton
          v-if="available.length > 1"
          size="lg"
          color="neutral"
          variant="ghost"
          :disabled="busy"
          @click="method = null"
        >
          {{ t('auth.enroll.otherMethod') }}
        </UButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.enroll {
  display: grid;
  gap: 16px;
}
.h2 {
  font-size: 18px;
  font-weight: 700;
}
.muted {
  color: var(--app-muted);
  font-size: 13.5px;
  line-height: 1.6;
}
.pick {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.pick-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px;
  border: 1.5px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 13px;
  text-align: start;
  cursor: pointer;
  transition: border-color var(--app-dur-base);
}
.pick-item:hover,
.pick-item:focus-visible {
  border-color: var(--app-accent);
}
.pick-item b {
  font-size: 14px;
}
.pick-item small {
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.5;
}
.steps {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-inline-start: 18px;
  color: var(--app-muted);
  font-size: 13px;
  line-height: 1.55;
  list-style: decimal;
}
.qr-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}
.qr {
  width: 148px;
  height: 148px;
  flex: none;
  padding: 6px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
  background: #fff;
}
.qr :deep(svg) {
  width: 100%;
  height: 100%;
}
.secret {
  display: grid;
  min-width: 0;
  flex: 1;
  justify-items: start;
  gap: 6px;
}
.secret code {
  font-size: 14px;
  word-break: break-all;
}
</style>

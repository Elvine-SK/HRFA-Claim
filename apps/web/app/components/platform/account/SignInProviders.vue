<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'
import { useEventListener } from '@vueuse/core'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { OidcIdentity, OidcProvider } from '../../../types/platform'

const { t, te } = useI18n()
const api = useApi()
const notify = useNotify()
const confirm = useConfirm()
const dates = useDates()
const session = useSession()
const manifest = useManifest()
const route = useRoute()
const router = useRouter()
const client = useQueryClient()

const providers = computed(
  () => (manifest.data.value as { oidc?: { providers: OidcProvider[] } } | undefined)?.oidc?.providers ?? [],
)
const identities = useQuery({
  queryKey: ['oidc', 'identities'],
  queryFn: async () => (await api<DataResponse<OidcIdentity[]>>('/auth/oidc/identities')).data,
  enabled: computed(() => providers.value.length > 0),
})
const identityOf = (key: string) => identities.data.value?.find((i) => i.provider === key)
const labelOf = (key: string) => providers.value.find((p) => p.key === key)?.label ?? key

const connecting = ref<OidcProvider | null>(null)
const askPassword = ref(false)
const busyKey = ref<string | null>(null)

// A page restored from the back-forward cache keeps its state: clear the busy button.
useEventListener('pageshow', (event: PageTransitionEvent) => {
  if (event.persisted) busyKey.value = null
})

async function startLink(key: string, password?: string) {
  const res = await api<DataResponse<{ location: string }>>(`/auth/oidc/${key}/link`, {
    method: 'POST',
    body: password === undefined ? {} : { password },
  })
  window.location.assign(res.data.location)
}

async function onConnect(p: OidcProvider) {
  if (session.user.value?.hasPassword) {
    connecting.value = p
    askPassword.value = true
    return
  }
  busyKey.value = p.key
  try {
    await startLink(p.key)
  } catch (error) {
    busyKey.value = null
    notify.error(error, { title: t('oidc.card.linkFailed') })
  }
}

async function onUnlink(identity: OidcIdentity) {
  const ok = await confirm({
    title: t('oidc.card.unlinkTitle', { label: identity.label }),
    description: t('oidc.card.unlinkText', { label: identity.label }),
    confirmLabel: t('oidc.card.unlink'),
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/auth/oidc/identities/${identity.id}`, { method: 'DELETE' })
    await client.invalidateQueries({ queryKey: ['oidc'] })
    notify.success(t('oidc.card.unlinked', { label: identity.label }))
  } catch (error) {
    notify.error(error)
  }
}

// Back from the provider: show the outcome once, then drop the params so a reload shows nothing.
onMounted(async () => {
  const linked = typeof route.query.linked === 'string' ? route.query.linked : null
  const failed = typeof route.query.oidcError === 'string' ? route.query.oidcError : null
  if (!linked && !failed) return
  if (linked)
    notify.success(t('oidc.card.linkedToast', { label: labelOf(linked) }), t('oidc.card.linkedToastText'))
  if (failed) {
    const key = `oidc.errors.${failed.replace(/^oidc\./, '')}`
    notify.error(new Error(te(key) ? t(key) : t('oidc.errors.failed')), { title: t('oidc.card.linkFailed') })
  }
  const { linked: _l, oidcError: _e, ...query } = route.query
  await router.replace({ query })
})
</script>

<template>
  <section v-if="providers.length" class="card" data-testid="sso-card">
    <header class="card-h">
      <h2>{{ t('oidc.card.title') }}</h2>
      <p>{{ t('oidc.card.text') }}</p>
    </header>
    <ul class="card-list">
      <li v-if="identities.isPending.value" class="sso-meta" data-testid="sso-loading">
        {{ t('oidc.card.loading') }}
      </li>
      <li v-else-if="identities.isError.value" class="sso-meta" data-testid="sso-error">
        {{ t('oidc.card.loadFailed') }}
        <UButton size="xs" variant="outline" @click="identities.refetch()">
          {{ t('platform.actions.retry') }}
        </UButton>
      </li>
      <template v-else>
        <li v-for="p in providers" :key="p.key">
          <span class="sso-ico"><UIcon name="i-lucide-key-round" /></span>
          <div class="min-w-0 flex-1">
            <b class="block text-[13.5px]">{{ p.label }}</b>
            <template v-if="identityOf(p.key)">
              <span v-if="identityOf(p.key)!.email" class="sso-meta">
                {{ t('oidc.card.email', { email: identityOf(p.key)!.email }) }}
              </span>
              <span class="sso-meta">
                {{ t('oidc.card.linkedAt', { date: dates.date(identityOf(p.key)!.createdAt) }) }} ·
                {{
                  identityOf(p.key)!.lastLoginAt
                    ? t('oidc.card.lastUsed', { date: dates.relative(identityOf(p.key)!.lastLoginAt) })
                    : t('oidc.card.neverUsed')
                }}
              </span>
            </template>
            <span v-else class="sso-meta">{{ t('oidc.card.notLinked') }}</span>
          </div>
          <UBadge v-if="identityOf(p.key)" color="success" variant="subtle">{{
            t('oidc.card.linked')
          }}</UBadge>
          <UButton
            v-if="identityOf(p.key)"
            size="sm"
            color="neutral"
            variant="ghost"
            :aria-label="`${t('oidc.card.unlink')} ${p.label}`"
            @click="onUnlink(identityOf(p.key)!)"
          >
            {{ t('oidc.card.unlink') }}
          </UButton>
          <UButton v-else size="sm" variant="outline" :loading="busyKey === p.key" @click="onConnect(p)">
            {{ t('oidc.card.connect') }}
          </UButton>
        </li>
      </template>
    </ul>
    <PlatformAuthPasswordDialog
      v-model:open="askPassword"
      :title="t('oidc.card.connectTitle', { label: connecting?.label ?? '' })"
      :description="t('oidc.card.connectText', { label: connecting?.label ?? '' })"
      :confirm-label="t('oidc.card.connect')"
      :action="(password) => startLink(connecting!.key, password)"
    />
  </section>
</template>

<style scoped>
.sso-ico {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: var(--app-r-sm);
  background: color-mix(in oklab, var(--app-accent) 11%, transparent);
  color: var(--app-accent);
}
.sso-meta {
  display: block;
  color: var(--app-muted);
  font-size: 12.5px;
}
</style>

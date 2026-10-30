<script setup lang="ts">
import type { RequestAction } from '../../../composables/useApprovals'
import type { Decision, DelegateCandidate } from '../../../types/approval'

const props = defineProps<{ id: string; shortcuts?: boolean; back?: boolean }>()
const emit = defineEmits<{ acted: [action: RequestAction | 'delegate']; back: [] }>()
const { t, te } = useI18n()
const { dateTime, relative } = useDates()
const notify = useNotify()
const confirm = useConfirm()
const entities = useApprovalEntityRegistry()

const detail = useApprovalRequest(() => props.id)
const request = computed(() => detail.data.value)
const { act } = useApprovalActions()
const busy = ref<RequestAction | null>(null)
const decide = useTemplateRef<{ run: (a: RequestAction) => void; clear: () => void; focus: () => void }>(
  'decide',
)

const link = computed(() =>
  request.value ? entities.link(request.value.entityType, request.value.entityId) : undefined,
)
const current = computed(() => {
  const r = request.value
  if (!r) return undefined
  return approvalStages(r.steps, r.round).find((s) => s.state === 'current')
})
const stageName = (key: string) =>
  te(`approval.stages.${key}`) ? t(`approval.stages.${key}`) : key.replaceAll(/[_-]/g, ' ')
const facts = computed(() =>
  Object.entries(request.value?.facts ?? {}).map(([key, value]) => ({
    key,
    label: te(`approval.facts.${key}`) ? t(`approval.facts.${key}`) : key,
    value:
      value === null || value === undefined
        ? null
        : typeof value === 'object'
          ? JSON.stringify(value)
          : te(`approval.factValues.${key}.${value}`)
            ? t(`approval.factValues.${key}.${value}`)
            : String(value),
  })),
)
// A record's own number (e.g. its REF) when its facts carry one, else the end of its id.
const recordNo = computed(() => {
  const ref = request.value?.facts?.ref
  return typeof ref === 'string' && ref ? ref : `#${request.value?.entityId.slice(-6) ?? ''}`
})

async function onAct(action: RequestAction, comment: string) {
  if (!request.value) return
  const ok = await confirm({
    title: t(`approval.decide.${action}Title`),
    description: t(`approval.decide.${action}Text`),
    confirmLabel: t(`approval.decide.${action === 'comment' ? 'commentOnly' : action}`),
    danger: action === 'reject' || action === 'cancel',
  })
  if (!ok) return
  busy.value = action
  try {
    await act.mutateAsync({ id: request.value.id, action, comment })
    decide.value?.clear()
    notify.success(t(`approval.toast.${action}`))
    emit('acted', action)
  } catch (error) {
    notify.error(error)
  } finally {
    busy.value = null
  }
}

const delegating = ref(false)
function onDelegated(person: DelegateCandidate) {
  notify.success(t('approval.toast.delegate', { name: person.displayName }))
  emit('acted', 'delegate')
}

defineExpose({
  decide: (d: Decision) => (request.value?.can.approve ? decide.value?.run(d) : undefined),
  focus: () => decide.value?.focus(),
})
</script>

<template>
  <div class="rv">
    <div v-if="detail.isPending.value" class="grid gap-3">
      <USkeleton class="h-10 w-2/3" />
      <USkeleton class="h-24 w-full" />
      <USkeleton class="h-40 w-full" />
    </div>
    <PlatformEmptyState
      v-else-if="detail.error.value || !request"
      kind="no-results"
      icon="i-lucide-circle-alert"
      tone="danger"
      :title="t('approval.detail.unavailable')"
      :text="detail.error.value ? notify.messageOf(detail.error.value) : undefined"
    />
    <template v-else>
      <header class="rv-h">
        <UButton
          v-if="back"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          class="rv-back"
          :aria-label="t('platform.actions.back')"
          @click="emit('back')"
        />
        <span class="hero self-center" aria-hidden="true"
          ><UIcon :name="entities.icon(request.entityType)" class="size-5"
        /></span>
        <div class="min-w-0 flex-1">
          <h2>
            <NuxtLink v-if="link" :to="link" class="hover:underline">{{
              entities.label(request.entityType)
            }}</NuxtLink>
            <template v-else>{{ entities.label(request.entityType) }}</template>
            <span class="muted ms-1.5 font-mono text-[13px] font-medium">{{ recordNo }}</span>
          </h2>
          <i18n-t keypath="approval.detail.submittedBy" scope="global" tag="p">
            <template #name>
              <b>{{ request.submittedBy.displayName }}</b>
            </template>
            <template #when>
              <time :datetime="request.submittedAt" :title="dateTime(request.submittedAt)">{{
                relative(request.submittedAt)
              }}</time>
            </template>
          </i18n-t>
          <p class="muted text-[12.5px]">
            {{ t('approval.detail.workflow') }}: <b>{{ request.workflow.name }}</b>
          </p>
        </div>
        <PlatformStatusBadge
          :tone="REQUEST_STATUS_TONES[request.status]"
          :label="t(`approval.status.${request.status}`)"
        />
        <UButton
          v-if="link"
          :to="link"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-arrow-up-right"
        >
          {{ t('approval.detail.openRecord', { entity: entities.label(request.entityType) }) }}
        </UButton>
      </header>

      <dl class="req-meta">
        <div>
          <dt>{{ t('approval.detail.stage') }}</dt>
          <dd>{{ current ? stageName(current.key) : '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('approval.detail.round') }}</dt>
          <dd>{{ request.round }}</dd>
        </div>
        <div>
          <dt>{{ request.completedAt ? t('approval.detail.completed') : t('approval.detail.submitted') }}</dt>
          <dd>{{ dateTime(request.completedAt ?? request.submittedAt) }}</dd>
        </div>
      </dl>

      <section class="sec">
        <h3>{{ t('approval.detail.progress') }}</h3>
        <PlatformApprovalFlow :steps="request.steps" :round="request.round" />
      </section>

      <section v-if="facts.length" class="sec">
        <h3>{{ t('approval.detail.facts') }}</h3>
        <PlatformKeyValue :items="facts" />
      </section>

      <section class="sec">
        <h3>{{ t('approval.detail.activity') }}</h3>
        <PlatformApprovalTimeline :events="request.events" :steps="request.steps" />
      </section>

      <PlatformApprovalDecide
        ref="decide"
        :request="request"
        :busy="busy"
        :shortcuts="shortcuts"
        @act="onAct"
        @delegate="delegating = true"
      />
      <PlatformApprovalDelegateDialog
        v-model:open="delegating"
        :request-id="request.id"
        @done="onDelegated"
      />
    </template>
  </div>
</template>

<style scoped>
.rv {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.rv-h {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 18px;
}
.rv-h h2 {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}
.rv-h p {
  margin-top: 3px;
  color: var(--app-muted);
  font-size: 13px;
}
.rv-h p b {
  color: var(--app-text);
  font-weight: 600;
}
.rv-back {
  display: none;
}
.hero {
  display: grid;
  flex: none;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--app-grad);
  color: var(--app-grad-fg);
}
.req-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 20px;
  margin: 0 0 18px;
  padding: 16px;
  border-radius: var(--app-r-md);
  background: var(--app-surface-2);
}
.req-meta dt {
  margin-bottom: 4px;
  color: var(--app-muted);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.req-meta dd {
  margin: 0;
  font-size: 13.5px;
  font-weight: 500;
  overflow-wrap: anywhere;
  text-transform: capitalize;
}
.sec {
  margin-bottom: 20px;
}
.sec h3 {
  margin-bottom: 10px;
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
@media (max-width: 900px) {
  .rv-back {
    display: inline-flex;
  }
}
@media (max-width: 560px) {
  .req-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

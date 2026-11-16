<script setup lang="ts">
import type { FormErrorWithId } from '@nuxt/ui'
import type { WizardStep } from '@elvine-sk/platform-nuxt/utils'
import type { z } from 'zod'

type ReviewRows = Record<string, { label: string; value: string }[]>

const props = withDefaults(
  defineProps<{
    /** The last step is the review step (`fields: []`). */
    steps: WizardStep[]
    /** Reactive form state, owned by the page. */
    state: Record<string, unknown>
    /** The full form schema; each step validates `schema.pick(step.fields)`. */
    schema: z.ZodObject<z.ZodRawShape>
    /** Rows for the review cards, per step key. */
    review: ReviewRows
    /** Show *Save draft*. */
    drafts?: boolean
    /** Steps that must be valid before a draft can be saved. */
    draftGate?: number[]
    /** ISO time of the last draft save. */
    savedAt?: string | null
    /** Disables the form and the actions. */
    busy?: boolean
    /** The state was loaded from a saved record: steps up to the first invalid one are open at once. */
    resumed?: boolean
  }>(),
  { drafts: false, draftGate: () => [0], savedAt: null, busy: false, resumed: false },
)
const emit = defineEmits<{ 'save-draft': []; cancel: [] }>()
defineSlots<
  {
    summary?: () => unknown
    next?: () => unknown
    actions?: (props: { validateAll: () => Promise<boolean> }) => unknown
  } & Record<`step-${string}`, () => unknown>
>()

const { t } = useI18n()
const { relative } = useDates()
const notify = useNotify()
const confirm = useConfirm()
const route = useRoute()
const router = useRouter()
const form = useTemplateRef('form')

const last = computed(() => props.steps.length - 1)
const furthest = ref(0)
const current = computed(() =>
  reachableStep(parseStepQuery(route.query.step), furthest.value, props.steps.length),
)
const step = computed(() => props.steps[current.value]!)
const onReview = computed(() => current.value === last.value)

function schemaFor(index: number) {
  const shape = props.schema.shape
  const fields = props.steps[index]!.fields.filter((f) => f in shape)
  return props.schema.pick(Object.fromEntries(fields.map((f) => [f, true])) as Record<string, true>)
}
const stepSchema = computed(() => (onReview.value ? props.schema : schemaFor(current.value)))
const stepValid = (index: number) => schemaFor(index).safeParse(props.state).success
const firstInvalid = (indexes: number[]) => indexes.find((i) => !stepValid(i))

// A loaded draft opens every step up to the first invalid one. Set before the URL check below runs.
if (props.resumed)
  furthest.value = firstInvalid(props.steps.map((_, i) => i).slice(0, last.value)) ?? last.value

// The URL names the step on screen: a step the user can't reach yet is rewritten, so a reload (or a draft
// saved from here) comes back to this step.
watch(
  current,
  (index) => {
    if (parseStepQuery(route.query.step) !== index)
      void router.replace({ query: { ...route.query, step: String(index + 1) } })
  },
  { immediate: true },
)

// After the first failed attempt, fields re-validate as the user edits (spec §5.6).
const submitted = ref(false)
const validateOn = computed(() => (submitted.value ? (['input', 'change', 'blur'] as const) : ([] as const)))

// Server field errors wait here until their step is on screen.
const serverErrors = ref<{ path: string; message: string }[]>([])

function go(index: number) {
  if (index > furthest.value) return
  void router.replace({ query: { ...route.query, step: String(index + 1) } })
}

function focusFirst(errors: FormErrorWithId[]) {
  const first = errors.find((e) => e.id || e.name)
  if (!first) return
  setTimeout(() =>
    nextTick(() => {
      const el =
        (first.id && document.getElementById(first.id)) ||
        (first.name && document.querySelector(`[name="${CSS.escape(first.name)}"]`))
      if (el instanceof HTMLElement) el.focus()
    }),
  )
}

/** Validates the step on screen; on failure shows the errors, toasts and focuses the first invalid field. */
async function validateShown() {
  const ok = (await form.value?.validate({ silent: true })) !== false
  if (!ok) {
    submitted.value = true
    const errors = form.value?.getErrors() ?? []
    notify.fixFields(errors.length)
    focusFirst(errors)
  }
  return ok
}

/** Goes to `index` and shows its errors. */
async function showStep(index: number) {
  furthest.value = Math.max(furthest.value, index)
  go(index)
  await nextTick()
  await nextTick()
  return validateShown()
}

async function next() {
  if (!(await validateShown())) return
  furthest.value = Math.max(furthest.value, current.value + 1)
  go(current.value + 1)
}

/** A stepper click: going back is free, going ahead checks the step on screen first. */
async function jump(index: number) {
  if (index > current.value && !onReview.value && !(await validateShown())) return
  go(index)
}

async function saveDraft() {
  const bad = firstInvalid(props.draftGate)
  if (bad !== undefined) {
    await showStep(bad)
    return
  }
  emit('save-draft')
}

/** Validates every step; on failure goes to the first failing one and shows its errors. */
async function validateAll() {
  const bad = firstInvalid(props.steps.map((_, i) => i).slice(0, last.value))
  if (bad === undefined) return true
  await showStep(bad)
  return false
}

function applyServerErrors() {
  const fields = step.value.fields
  const shown = serverErrors.value.filter((e) => fields.includes(e.path.split('.')[0]!))
  if (!shown.length) return
  form.value?.setErrors(shown.map((e) => ({ name: e.path, message: e.message })))
  focusFirst(form.value?.getErrors() ?? [])
}

/** Puts server field errors on their fields and goes to the earliest step owning one. True if any were known. */
function setServerErrors(errors: { path: string; message: string }[]) {
  const known = errors.filter((e) => stepOfField(props.steps, e.path) >= 0)
  serverErrors.value = known
  const index = firstErrorStep(
    props.steps,
    known.map((e) => e.path),
  )
  if (index === null) return false
  submitted.value = true
  furthest.value = Math.max(furthest.value, index)
  if (index === current.value) nextTick(applyServerErrors)
  else go(index)
  return true
}

watch(current, () => {
  form.value?.clear()
  nextTick(applyServerErrors)
})

// Unsaved changes: compare with the state at mount or at the last save.
const snapshot = () => JSON.parse(JSON.stringify(props.state)) as unknown
const baseline = shallowRef(snapshot())
const dirty = computed(() => !sameValues(props.state, baseline.value))

/** The page saved the record: the current state is the new baseline. */
function markSaved() {
  baseline.value = snapshot()
  serverErrors.value = []
}

onBeforeRouteLeave((to, from) => {
  if (to.path === from.path || !dirty.value) return true
  return confirm({
    title: t('wizard.leaveTitle'),
    description: t('wizard.leaveText'),
    confirmLabel: t('wizard.leave'),
    danger: true,
  })
})

function onUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onUnload))

defineExpose({ validateAll, setServerErrors, markSaved })
</script>

<template>
  <div class="wz">
    <UCard class="wz-card" :ui="{ header: 'p-3 sm:px-4', body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
      <template #header>
        <PlatformWizardStepper
          :steps="steps"
          :current="current"
          :furthest="furthest"
          :disabled="busy"
          @go="jump"
        />
      </template>

      <UForm
        ref="form"
        :schema="stepSchema"
        :state="state"
        :validate-on="[...validateOn]"
        :disabled="busy"
        class="wz-body"
        @submit.prevent
      >
        <template v-if="onReview">
          <div class="mb-4">
            <h2 class="wz-h">{{ t('wizard.review') }}</h2>
            <p class="muted text-[13.5px]">{{ t('wizard.reviewHint') }}</p>
          </div>
          <PlatformWizardReview :steps="steps.slice(0, last)" :review="review" :disabled="busy" @edit="go" />
        </template>
        <template v-else>
          <div class="mb-4">
            <h2 class="wz-h">{{ step.label }}</h2>
            <p v-if="step.caption" class="muted text-[13.5px]">{{ step.caption }}</p>
          </div>
          <p v-if="step.help" class="wz-help">
            <UIcon name="i-lucide-info" class="mt-0.5 size-4 flex-none" aria-hidden="true" />
            <span>{{ step.help }}</span>
          </p>
          <div class="flex flex-col gap-5">
            <slot :name="`step-${step.key}`" />
          </div>
        </template>
      </UForm>

      <div class="wz-bar">
        <span class="muted flex items-center gap-1.5 text-[12.5px]">
          <UIcon name="i-lucide-clock" class="size-3.5" aria-hidden="true" />
          {{ t('wizard.stepOf', { n: current + 1, total: steps.length }) }}
          <template v-if="savedAt">· {{ t('wizard.draftSaved', { when: relative(savedAt) }) }}</template>
        </span>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="busy" @click="emit('cancel')">
            {{ t('wizard.cancel') }}
          </UButton>
          <UButton
            v-if="current > 0"
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="go(current - 1)"
          >
            {{ t('wizard.back') }}
          </UButton>
          <UButton v-if="drafts" color="neutral" variant="outline" :disabled="busy" @click="saveDraft">
            {{ t('wizard.saveDraft') }}
          </UButton>
          <UButton v-if="!onReview" trailing-icon="i-lucide-chevron-right" :disabled="busy" @click="next">
            {{ t('wizard.continue') }}
          </UButton>
          <slot v-else name="actions" :validate-all="validateAll" />
        </div>
      </div>
    </UCard>

    <aside class="wz-aside">
      <UCard v-if="$slots.summary" :ui="{ body: 'p-3 sm:p-4' }">
        <h3 class="wz-aside-h">{{ t('wizard.summary') }}</h3>
        <slot name="summary" />
      </UCard>
      <UCard v-if="$slots.next" :ui="{ body: 'p-3 sm:p-4' }">
        <h3 class="wz-aside-h">{{ t('wizard.next') }}</h3>
        <slot name="next" />
      </UCard>
    </aside>
  </div>
</template>

<style scoped>
.wz {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--app-gap);
  align-items: start;
}
.wz-body {
  padding: var(--app-pad);
}
.wz-h {
  font-size: 17px;
  font-weight: 700;
}
.wz-help {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--app-info) 35%, transparent);
  border-radius: var(--app-r-sm);
  background: color-mix(in oklab, var(--app-info) 10%, transparent);
  font-size: 13px;
}
.wz-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px var(--app-pad);
  border-top: 1px solid var(--app-border);
  border-radius: 0 0 var(--app-r-lg) var(--app-r-lg);
  background: var(--app-surface-2);
}
.wz-aside {
  display: flex;
  flex-direction: column;
  gap: var(--app-gap);
}
.wz-aside-h {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted);
}
@media (max-width: 1100px) {
  .wz {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

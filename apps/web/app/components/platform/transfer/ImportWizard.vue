<script setup lang="ts">
import type { ImportResult } from '@elvine-sk/platform-nuxt/utils'

const MAX_BYTES = 5 * 1024 * 1024

const props = defineProps<{ entity: string; entities?: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [result: ImportResult] }>()
const { t } = useI18n()
const notify = useNotify()
const { entity: spec } = useTransferEntity(() => props.entity)
const actions = useTransferActions()

type Step = 'upload' | 'check' | 'done'
const step = ref<Step>('upload')
const file = ref<File | null>(null)
const csv = ref('')
const fileError = ref<string | null>(null)
const dragging = ref(false)
const jobId = ref<string | null>(null)
const phase = ref<'dry' | 'real' | null>(null)
const starting = ref(false)
const job = useTransferJob(jobId)
const dryResult = ref<ImportResult | null>(null)
const realResult = ref<ImportResult | null>(null)
const failed = ref<string | null>(null)
const busy = computed(() => starting.value || (!!jobId.value && !isTransferFinished(job.data.value?.status)))
const errors = useFormErrors<'file'>()
const input = useTemplateRef<HTMLInputElement>('input')

const steps = computed(() => [
  { key: 'upload', label: t('transfer.import.steps.upload') },
  { key: 'check', label: t('transfer.import.steps.check') },
  { key: 'done', label: t('transfer.import.steps.done') },
])
const stepIndex = computed(() => steps.value.findIndex((s) => s.key === step.value))
const result = computed(() => (step.value === 'done' ? realResult.value : dryResult.value))
const rowErrors = computed(() => (result.value ? flattenRowErrors(result.value) : []))
const columns = computed(() => spec.value?.import?.columns ?? [])

watch(open, (o) => o && reset())
function reset() {
  step.value = 'upload'
  file.value = null
  csv.value = ''
  fileError.value = null
  jobId.value = null
  phase.value = null
  dryResult.value = null
  realResult.value = null
  failed.value = null
  errors.clear()
}

async function pick(f: File | undefined | null) {
  fileError.value = null
  errors.clear()
  if (!f) return
  if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') {
    fileError.value = t('transfer.import.notCsv')
    return
  }
  if (f.size > MAX_BYTES) {
    fileError.value = t('transfer.import.tooBig', { mb: MAX_BYTES / 1024 / 1024 })
    return
  }
  file.value = f
  csv.value = (await f.text()).replace(/^\uFEFF/, '')
  dryResult.value = null
}
function onDrop(e: DragEvent) {
  dragging.value = false
  pick(e.dataTransfer?.files?.[0])
}

async function run(dryRun: boolean) {
  if (!csv.value) return
  failed.value = null
  errors.clear()
  starting.value = true
  try {
    phase.value = dryRun ? 'dry' : 'real'
    jobId.value = await actions.startImport(props.entity, csv.value, dryRun)
    step.value = dryRun ? 'check' : 'done'
  } catch (error) {
    phase.value = null
    errors.apply(error, ['file'])
    if (!dryRun) step.value = 'check'
  } finally {
    starting.value = false
  }
}

watch(
  () => job.data.value?.status,
  (status) => {
    if (!jobId.value || !status || !isTransferFinished(status)) return
    const res = importResultOf(job.data.value)
    if (status === 'dead' || !res)
      failed.value = res?.error ?? job.data.value?.lastError ?? t('transfer.import.failed')
    else if (phase.value === 'dry') dryResult.value = res
    else {
      realResult.value = res
      emit('imported', res)
      if (res.succeeded) notify.success(t('transfer.import.doneToast', { n: res.succeeded }, res.succeeded))
    }
    jobId.value = null
  },
)

async function template() {
  try {
    await actions.downloadTemplate(props.entity)
  } catch (error) {
    notify.error(error)
  }
}
const sizeOf = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`)
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('transfer.import.title', { entities: entities ?? spec?.label ?? entity })"
    :description="t('transfer.import.subtitle')"
    :dismissible="!busy"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <ol class="stepper" :aria-label="t('transfer.import.progress')">
        <li
          v-for="(s, i) in steps"
          :key="s.key"
          :class="{ cur: i === stepIndex, done: i < stepIndex }"
          :aria-current="i === stepIndex ? 'step' : undefined"
        >
          <span class="dot" aria-hidden="true">
            <UIcon v-if="i < stepIndex" name="i-lucide-check" class="size-3.5" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <b>{{ s.label }}</b>
        </li>
      </ol>

      <div v-if="step === 'upload'" class="grid gap-4">
        <div class="flex flex-wrap items-center gap-3 text-[13px]">
          <span class="muted min-w-0 flex-1">{{ t('transfer.import.templateHint') }}</span>
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-file-down" @click="template">
            {{ t('transfer.import.template') }}
          </UButton>
        </div>
        <div v-if="columns.length" class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="c in columns"
            :key="c.key"
            :color="c.required ? 'primary' : 'neutral'"
            variant="subtle"
          >
            {{ c.label }}<span v-if="c.required" aria-hidden="true">*</span>
            <span v-if="c.required" class="sr-only">({{ t('transfer.import.required') }})</span>
          </UBadge>
        </div>
        <label
          class="drop"
          :class="{ 'is-drag': dragging, 'is-bad': fileError || errors.fields.file }"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <input
            ref="input"
            type="file"
            accept=".csv,text/csv"
            class="sr-only"
            @change="pick(($event.target as HTMLInputElement).files?.[0])"
          />
          <UIcon
            :name="file ? 'i-lucide-file-check-2' : 'i-lucide-upload-cloud'"
            class="size-7 text-[var(--app-accent)]"
          />
          <template v-if="file">
            <b class="max-w-full truncate">{{ file.name }}</b>
            <span class="muted text-[12.5px]"
              >{{ sizeOf(file.size) }} · {{ t('transfer.import.replace') }}</span
            >
          </template>
          <template v-else>
            <b>{{ t('transfer.import.drop') }}</b>
            <span class="muted text-[12.5px]">{{ t('transfer.import.dropHint') }}</span>
          </template>
        </label>
        <p
          v-if="fileError || errors.fields.file || errors.message.value"
          class="text-[13px] text-[var(--app-bad)]"
          role="alert"
        >
          {{ fileError ?? errors.fields.file ?? errors.message.value }}
        </p>
      </div>

      <div v-else class="grid gap-4">
        <div
          v-if="busy"
          class="flex items-center gap-3 rounded-[var(--app-r-sm)] bg-[var(--app-surface-2)] p-4"
          role="status"
        >
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-[var(--app-accent)]" />
          <div>
            <b class="block text-[13.5px]">{{
              phase === 'dry' ? t('transfer.import.checking') : t('transfer.import.importing')
            }}</b>
            <span class="muted text-[12.5px]">{{
              t(`transfer.status.${job.data.value?.status ?? 'queued'}`)
            }}</span>
          </div>
        </div>
        <UAlert
          v-else-if="failed"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('transfer.import.failed')"
          :description="failed"
        />
        <UAlert
          v-if="errors.message.value || errors.fields.file"
          color="error"
          variant="subtle"
          :description="errors.fields.file ?? errors.message.value ?? ''"
        />

        <template v-if="result && !busy">
          <UAlert
            v-if="step === 'check'"
            :color="result.failed ? 'warning' : 'success'"
            variant="subtle"
            :icon="result.failed ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
            :title="
              result.failed
                ? t('transfer.import.checkIssues', { n: result.failed }, result.failed)
                : t('transfer.import.checkOk')
            "
            :description="t('transfer.import.checkSummary', { ok: result.succeeded, total: result.total })"
          />
          <UAlert
            v-else
            :color="result.failed ? 'warning' : 'success'"
            variant="subtle"
            icon="i-lucide-circle-check"
            :title="t('transfer.import.doneTitle', { n: result.succeeded }, result.succeeded)"
            :description="
              result.failed
                ? t('transfer.import.doneSkipped', { n: result.failed }, result.failed)
                : undefined
            "
          />
          <PlatformStatStrip
            :items="[
              { label: t('transfer.import.total'), value: result.total },
              {
                label: step === 'done' ? t('transfer.import.imported') : t('transfer.import.valid'),
                value: result.succeeded,
              },
              { label: t('transfer.import.withErrors'), value: result.failed },
            ]"
          />
          <p v-if="result.ignoredColumns.length" class="muted text-[12.5px]">
            {{ t('transfer.import.ignored') }} <code>{{ result.ignoredColumns.join(', ') }}</code>
          </p>
          <div v-if="rowErrors.length" class="errs">
            <table>
              <caption class="sr-only">
                {{
                  t('transfer.import.errorsCaption')
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ t('transfer.import.row') }}</th>
                  <th scope="col">{{ t('transfer.import.field') }}</th>
                  <th scope="col">{{ t('transfer.import.problem') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(e, i) in rowErrors" :key="i">
                  <td class="font-mono">{{ e.row }}</td>
                  <td class="font-mono">{{ e.field || '—' }}</td>
                  <td>{{ e.message }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <template v-if="step === 'upload'">
          <UButton color="neutral" variant="ghost" @click="open = false">{{
            t('platform.actions.cancel')
          }}</UButton>
          <UButton icon="i-lucide-shield-check" :disabled="!csv" :loading="starting" @click="run(true)">
            {{ t('transfer.import.check') }}
          </UButton>
        </template>
        <template v-else-if="step === 'check'">
          <UButton color="neutral" variant="ghost" :disabled="busy" @click="step = 'upload'">{{
            t('platform.actions.back')
          }}</UButton>
          <UButton
            icon="i-lucide-upload"
            :disabled="busy || !dryResult || !dryResult.succeeded"
            :loading="starting"
            @click="run(false)"
          >
            {{
              dryResult?.failed
                ? t('transfer.import.runValid', { n: dryResult.succeeded }, dryResult.succeeded)
                : t('transfer.import.run')
            }}
          </UButton>
        </template>
        <UButton v-else :disabled="busy" @click="open = false">{{ t('platform.actions.done') }}</UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.stepper {
  display: flex;
  gap: 8px;
  margin: 0 0 18px;
  padding: 0;
  list-style: none;
}
.stepper li {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--app-muted);
  font-size: 12.5px;
}
.stepper li b {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stepper li:not(:last-child)::after {
  content: '';
  flex: 1;
  min-width: 12px;
  height: 2px;
  background: var(--app-border);
}
.stepper li.done::after {
  background: var(--app-ok);
}
.dot {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 2px solid var(--app-border);
  border-radius: 50%;
  font: 600 11px var(--app-mono);
}
.cur {
  color: var(--app-text) !important;
}
.cur .dot {
  border-color: var(--app-accent);
  color: var(--app-accent);
}
.done .dot {
  border-color: var(--app-ok);
  background: var(--app-ok);
  color: #fff;
}
.drop {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 28px 16px;
  border: 2px dashed var(--app-border);
  border-radius: var(--app-r-md);
  text-align: center;
  cursor: pointer;
  transition:
    border-color var(--app-dur-fast),
    background var(--app-dur-fast);
}
.drop:hover,
.drop.is-drag,
.drop:focus-within {
  border-color: var(--app-accent);
  background: color-mix(in oklab, var(--app-accent) 6%, transparent);
}
.drop:focus-within {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.drop.is-bad {
  border-color: var(--app-bad);
}
.errs {
  max-height: 280px;
  overflow: auto;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-sm);
}
.errs table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.errs th {
  position: sticky;
  top: 0;
  padding: 8px 10px;
  background: var(--app-surface-2);
  color: var(--app-muted);
  font-weight: 600;
  text-align: start;
}
.errs td {
  padding: 7px 10px;
  border-top: 1px solid var(--app-border);
  vertical-align: top;
  overflow-wrap: anywhere;
}
@media (max-width: 520px) {
  .stepper li:not(.cur) b {
    display: none;
  }
}
</style>

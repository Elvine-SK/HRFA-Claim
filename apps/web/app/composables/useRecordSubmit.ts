import type { DataResponse } from '@elvine-sk/platform-core'
import { useQueryClient } from '@tanstack/vue-query'
import type { AvailableWorkflow } from '../types/approval'

function noApproverReason(error: { details?: unknown }) {
  const details = error.details as { reason?: unknown } | undefined
  return typeof details?.reason === 'string' ? details.reason : undefined
}

/**
 * Submits a record to approval: loads the workflows available for its type, then confirms (one) or opens
 * the picker (several). Bind `choosing` and `choices` to `PlatformApprovalSubmitDialog` and call
 * `confirmChoice` from its `@confirm`.
 */
export function useRecordSubmit(entityType: MaybeRefOrGetter<string>) {
  const { t } = useI18n()
  const notify = useNotify()
  const confirm = useConfirm()
  const api = useApi()
  const client = useQueryClient()

  const submitting = ref(false)
  const choosing = ref(false)
  const choices = ref<AvailableWorkflow[]>([])
  let path = ''
  let settle: ((requestId: string | null) => void) | null = null

  function finish(requestId: string | null) {
    const done = settle
    settle = null
    done?.(requestId)
  }

  // Closing the picker without a successful submit ends the flow.
  watch(choosing, (open) => {
    if (!open) finish(null)
  })

  async function loadChoices() {
    const type = encodeURIComponent(toValue(entityType))
    const res = await api<DataResponse<AvailableWorkflow[]>>(
      `/approval/workflows/available?entityType=${type}`,
    )
    choices.value = res.data
    return res.data
  }

  /** Sends the submit. Resolves to the request id, or null when it failed (the error is already shown). */
  async function send(workflow: string): Promise<string | null> {
    submitting.value = true
    try {
      const res = await api<DataResponse<{ requestId: string }>>(path, { method: 'POST', body: { workflow } })
      await client.invalidateQueries({ queryKey: [APPROVAL_KEY] })
      notify.success(t('approval.record.submitted'))
      finish(res.data.requestId)
      choosing.value = false
      return res.data.requestId
    } catch (error) {
      // A step the organisation could not fill says why (no unit in the fact, nobody holds the role above it).
      const reason =
        isApiError(error) && error.code === 'approval.no_approvers' ? noApproverReason(error) : undefined
      notify.error(error, reason ? { description: reason } : {})
      // The workflow was deactivated or narrowed while the dialog was open: show the current list.
      const code = isApiError(error) ? error.code : undefined
      if (code === 'approval.workflow_unavailable' || code === 'approval.workflow_required') {
        const list = await loadChoices().catch(() => [])
        if (!list.length) choosing.value = false
      }
      return null
    } finally {
      submitting.value = false
    }
  }

  /**
   * Starts the flow for the record's submit endpoint (e.g. `/notes/{id}/submit`). Resolves to the request id,
   * or null if the user cancelled or it failed (the error is already shown).
   */
  async function submit(submitPath: string, opts: { label: string }): Promise<string | null> {
    finish(null)
    path = submitPath
    let list: AvailableWorkflow[]
    try {
      list = await loadChoices()
    } catch (error) {
      notify.error(error)
      return null
    }
    if (!list.length) {
      notify.error(new Error(t('approval.record.noWorkflow')))
      return null
    }
    if (list.length > 1) {
      const result = new Promise<string | null>((resolve) => (settle = resolve))
      choosing.value = true
      return result
    }
    const ok = await confirm({
      title: t('approval.record.submitTitle'),
      description: `${t('approval.record.submitText')} ${t('approval.record.submitWith', { name: list[0]!.name })}`,
      confirmLabel: opts.label,
    })
    return ok ? send(list[0]!.key) : null
  }

  /** The picker's `@confirm`: submits with the chosen workflow; the dialog stays open on failure. */
  async function confirmChoice(key: string) {
    await send(key)
  }

  return { submitting, choosing, choices, submit, confirmChoice }
}

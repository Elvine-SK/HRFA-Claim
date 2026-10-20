import type { ToastProps } from '@nuxt/ui'

const SUCCESS_MS = 4000
const UNDO_MS = 6000

type ToastAction = NonNullable<ToastProps['actions']>[number]

/** Toast conventions (spec §6.1): success 4 s, errors sticky with the request ID, undo 6 s. */
export function useNotify() {
  const toast = useToast()
  const { t } = useI18n()

  function success(title: string, description?: string) {
    toast.add({ title, description, color: 'success', icon: 'i-lucide-circle-check', duration: SUCCESS_MS })
  }

  function info(title: string, description?: string) {
    toast.add({ title, description, color: 'info', icon: 'i-lucide-info', duration: SUCCESS_MS })
  }

  function messageOf(error: unknown): string {
    if (!isApiError(error)) return error instanceof Error ? error.message : t('platform.errors.generic')
    if (error.isNetwork) return t('platform.errors.network')
    if (error.isStaleVersion) return t('platform.errors.stale')
    if (error.status === 403) return t('platform.errors.forbidden')
    return error.message || t('platform.errors.generic')
  }

  function error(
    err: unknown,
    options: { title?: string; description?: string; actions?: ToastAction[] } = {},
  ) {
    const requestId = isApiError(err) ? err.requestId : undefined
    const message = messageOf(err)
    const title = options.title ?? message
    const detail = options.description ?? (title === message ? undefined : message)
    const lines = [detail, requestId ? t('platform.errors.requestId', { id: requestId }) : undefined]
    toast.add({
      title,
      description: lines.filter(Boolean).join(' · ') || undefined,
      color: 'error',
      icon: 'i-lucide-circle-alert',
      duration: 0,
      actions: options.actions,
      type: 'foreground',
    })
  }

  function undoable(title: string, onUndo: () => void) {
    toast.add({
      title,
      color: 'neutral',
      duration: UNDO_MS,
      actions: [
        {
          label: t('platform.actions.undo'),
          color: 'neutral',
          variant: 'outline',
          size: 'sm',
          onClick: onUndo,
        },
      ],
    })
  }

  function fixFields(count: number) {
    toast.add({
      title: t('platform.errors.validation', { n: count }, count),
      color: 'error',
      icon: 'i-lucide-circle-alert',
      duration: SUCCESS_MS,
    })
  }

  return { success, info, error, undoable, fixFields, messageOf }
}

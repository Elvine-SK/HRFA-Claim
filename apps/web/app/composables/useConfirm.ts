import ConfirmDialog from '../components/platform/ConfirmDialog.vue'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  /** The word the person must type before the confirm button works (e.g. "Delete"). */
  typeToConfirm?: string
}

/** Promise-based confirmation for irreversible actions (spec §6.1). Resolves `true` when confirmed. */
export function useConfirm() {
  const overlay = useOverlay()
  const dialog = overlay.create(ConfirmDialog)
  return async (options: ConfirmOptions): Promise<boolean> => !!(await dialog.open(options).result)
}

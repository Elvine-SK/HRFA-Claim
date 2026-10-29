type CancelListener = (agreementId: string, reason: string) => Promise<void>

const cancelListeners: CancelListener[] = []

/** Registers a listener run inside the cancel transaction; modules that depend on agreements use it in `setup`. */
export function onAgreementCancelled(listener: CancelListener): void {
  cancelListeners.push(listener)
}

/** Runs every listener in order; an error propagates, so the cancel rolls back with it. */
export async function agreementCancelled(agreementId: string, reason: string): Promise<void> {
  for (const listener of cancelListeners) await listener(agreementId, reason)
}

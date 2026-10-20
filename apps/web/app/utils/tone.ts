export type Tone =
  | 'neutral'
  | 'info'
  | 'warning'
  | 'success'
  | 'danger'
  | 'accent'
  | 'chart-2'
  | 'chart-3'
  | 'chart-4'
  | 'chart-5'
  | 'chart-6'

const TONE_VARS: Record<Tone, string> = {
  neutral: 'var(--app-muted)',
  info: 'var(--app-info)',
  warning: 'var(--app-warn)',
  success: 'var(--app-ok)',
  danger: 'var(--app-bad)',
  accent: 'var(--app-accent)',
  'chart-2': 'var(--app-chart-2)',
  'chart-3': 'var(--app-chart-3)',
  'chart-4': 'var(--app-chart-4)',
  'chart-5': 'var(--app-chart-5)',
  'chart-6': 'var(--app-chart-6)',
}

export function toneVar(tone: Tone): string {
  return TONE_VARS[tone]
}

/** Platform status vocabulary → tone (spec §5.8). Modules map their own statuses next to their pages. */
export const PLATFORM_STATUS_TONES: Record<string, Tone> = {
  draft: 'neutral',
  pending: 'info',
  submitted: 'info',
  in_review: 'warning',
  returned: 'warning',
  approved: 'success',
  active: 'success',
  published: 'success',
  rejected: 'danger',
  disabled: 'danger',
  cancelled: 'neutral',
  archived: 'neutral',
}

export function statusTone(status: string, overrides: Record<string, Tone> = {}): Tone {
  return overrides[status] ?? PLATFORM_STATUS_TONES[status] ?? 'neutral'
}

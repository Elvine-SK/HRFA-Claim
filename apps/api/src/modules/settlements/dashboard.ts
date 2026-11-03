import { defineDashboardStat } from '@elvine-sk/platform-dashboard'
import { caller, callerScope, type C } from '../agreements/scope.ts'
import { countOf } from '../payments/dashboard.ts'
import { overdueCutoff, overdueRows, toFileRows } from './queries.ts'

/** Dashboard numbers (spec §14): overdue settlements for Finance, and the caller's own to file. */
export const settlementStats = [
  defineDashboardStat({
    key: 'settlements.overdue',
    label: 'settlements.stats.overdue',
    icon: 'i-lucide-alarm-clock',
    tone: 'danger',
    order: 51,
    permission: 'settlement.read',
    value: async ({ ctx, c }) => {
      // The same rows as `GET /settlements/overdue`.
      const scope = await callerScope(ctx, c as C, 'settlement.read')
      if (scope.kind === 'own') return 0
      let qb = overdueRows(await overdueCutoff())
      if (scope.kind === 'branch') qb = qb.where('a.branchCode', '=', scope.branch)
      return countOf(qb)
    },
  }),
  defineDashboardStat({
    key: 'settlements.to_file',
    label: 'settlements.stats.toFile',
    icon: 'i-lucide-file-pen',
    tone: 'info',
    order: 52,
    value: async ({ ctx, c }) => {
      const { eid } = await caller(ctx, c as C)
      return eid ? countOf(toFileRows(eid)) : 0
    },
  }),
]

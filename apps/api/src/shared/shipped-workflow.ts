import { readFileSync } from 'node:fs'
import { defineShippedWorkflow, type ShippedWorkflow } from '@elvine-sk/platform-approval'

/**
 * A module's `workflow.json` as a shipped workflow: `migrate` creates and publishes it, and makes it its record
 * type's default once when the type has none. An administrator's later edits are kept (`approval:apply --force`
 * puts the file's version back).
 */
export function shippedWorkflowFrom(file: URL): ShippedWorkflow {
  const w = JSON.parse(readFileSync(file, 'utf8')) as Omit<ShippedWorkflow, 'default'>
  return defineShippedWorkflow({ ...w, default: true })
}

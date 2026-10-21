// Usage: node copy-tsx.mjs <apps/api dir> <destination node_modules>
// Copies tsx and its dependency closure (as real directories) into the destination, flat, skipping
// packages already there. Run from the workspace install, where tsx is a dev dependency of apps/api.
import { cpSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const [apiDir, dest] = process.argv.slice(2)
if (!apiDir || !dest) throw new Error('usage: copy-tsx.mjs <api dir> <dest node_modules>')

function findPackageDir(fromDir, name) {
  // Walk up node_modules directories like Node does, so packages without an exports entry for
  // package.json still resolve.
  let dir = fromDir
  for (;;) {
    for (const candidate of [join(dir, 'node_modules', name), ...(basename(dir) === 'node_modules' ? [join(dir, name)] : [])]) {
      if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const seen = new Set()
function copy(name, fromDir, optional) {
  if (seen.has(name)) return
  const dir = findPackageDir(fromDir, name)
  if (!dir) {
    if (optional) return
    throw new Error(`cannot find ${name} from ${fromDir}`)
  }
  seen.add(name)
  const target = join(dest, name)
  if (!existsSync(target)) cpSync(dir, target, { recursive: true, dereference: true })
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  // Dependencies of a pnpm package sit beside its real directory, so resolve from there.
  for (const dep of Object.keys(pkg.dependencies ?? {})) copy(dep, dir, false)
  for (const dep of Object.keys(pkg.optionalDependencies ?? {})) copy(dep, dir, true)
}

copy('tsx', apiDir, false)
console.log(`tsx closure copied: ${[...seen].join(', ')}`)

// Usage: node assemble-api.mjs <apps/api dir> <destination apps/api dir>
//
// Builds the API folder of the bundle from the workspace install, with real copies only:
//  - the API's own files, by allowlist (API_FILES below): `.env`, `.env.*` other than the example, `storage/`,
//    logs and uploads can never be shipped,
//  - tsconfig.base.json from the repo root (tsx reads `extends ../../tsconfig.base.json`),
//  - a package.json whose link: dependencies carry the copied version instead (the file in the repo is
//    generated and stays as it is),
//  - production node_modules: every dependency of the API, and of each dependency in turn, found by Node's
//    own lookup from its real directory (so it works for packages linked from ../nelvine-platform, which
//    `pnpm deploy` cannot copy),
//  - tsx and its dependencies, a dev dependency of the API that the PM2 start command needs.
// Packages sit at the top of node_modules; a second version of one package goes under its requester.
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

const [apiDir, destApi] = process.argv.slice(2)
if (!apiDir || !destApi) throw new Error('usage: assemble-api.mjs <api dir> <destination api dir>')

// Everything the API needs at runtime (PM2 runs src/main.ts and src/cli.ts through tsx). package.json is
// rewritten below; tsconfig.json extends the root tsconfig.base.json, copied to the same relative place.
const API_FILES = ['src', 'package.json', 'tsconfig.json', '.env.example', 'openapi.json']
const SKIP_IN_PACKAGE = new Set(['node_modules', '.turbo', '.vite-temp', 'test', 'coverage', '.git'])

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

mkdirSync(destApi, { recursive: true })
for (const name of API_FILES) {
  const from = join(apiDir, name)
  if (!existsSync(from)) throw new Error(`${name} is missing from ${apiDir}`)
  cpSync(from, join(destApi, name), { recursive: true, dereference: true })
}
// tsconfig.json of the API extends ../../tsconfig.base.json: same place in the bundle (<bundle>/tsconfig.base.json).
const base = join(resolve(apiDir, '..', '..'), 'tsconfig.base.json')
const baseDest = join(resolve(destApi, '..', '..'), 'tsconfig.base.json')
if (!existsSync(base)) throw new Error(`${base} is missing`)
cpSync(base, baseDest)

/** Real directory of a package as Node finds it from `fromDir` (a real directory). */
function findPackageDir(fromDir, name) {
  let dir = fromDir
  for (;;) {
    const candidates = [join(dir, 'node_modules', name)]
    if (basename(dir) === 'node_modules') candidates.push(join(dir, name))
    for (const candidate of candidates) {
      if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const rootModules = join(destApi, 'node_modules')
const placedAt = new Map() // destination package dir -> real source dir
const versions = new Map() // package name -> version, for the summary
const skipped = [] // optional and peer packages that could not be found: [requester, name, kind]

/** Copy `name` (found from `fromRealDir`) for the package installed at `parentDir`; returns nothing. */
function place(name, fromRealDir, parentDir, kind) {
  const realDir = findPackageDir(fromRealDir, name)
  if (!realDir) {
    if (kind === 'required') throw new Error(`cannot find ${name} from ${fromRealDir}`)
    skipped.push([fromRealDir, name, kind])
    return
  }
  let target = join(rootModules, name)
  if (placedAt.has(target) && placedAt.get(target) !== realDir) target = join(parentDir, 'node_modules', name)
  if (placedAt.has(target) && placedAt.get(target) !== realDir) {
    // Happens for the API's own dependencies, whose "nested" place is the top level itself.
    throw new Error(`version clash for ${name}: ${target} holds ${placedAt.get(target)}, ${fromRealDir} needs ${realDir}`)
  }
  if (placedAt.get(target) === realDir) return
  placedAt.set(target, realDir)
  cpSync(realDir, target, {
    recursive: true,
    dereference: true,
    filter: (src) => !SKIP_IN_PACKAGE.has(relative(realDir, src)),
  })
  const pkg = readJson(join(realDir, 'package.json'))
  versions.set(name, pkg.version)
  for (const dep of Object.keys(pkg.dependencies ?? {})) place(dep, realDir, target, 'required')
  for (const dep of Object.keys(pkg.optionalDependencies ?? {})) place(dep, realDir, target, 'optional')
  for (const dep of Object.keys(pkg.peerDependencies ?? {})) place(dep, realDir, target, 'peer')
}

const apiReal = realpathSync(apiDir)
const apiPkg = readJson(join(apiDir, 'package.json'))
for (const dep of Object.keys(apiPkg.dependencies ?? {})) place(dep, apiReal, destApi, 'required')
place('tsx', apiReal, destApi, 'required')

// Verify: every dependency and peer of every copied package resolves from inside the bundle.
function resolvesInBundle(fromDir, name) {
  let dir = fromDir
  for (;;) {
    if (existsSync(join(dir, 'node_modules', name, 'package.json'))) return true
    if (dir === destApi) return false
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}
const missing = []
for (const target of placedAt.keys()) {
  const pkg = readJson(join(target, 'package.json'))
  const optionalPeers = pkg.peerDependenciesMeta ?? {}
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (!resolvesInBundle(target, name)) missing.push(`${pkg.name} needs ${name}`)
  }
  for (const name of Object.keys(pkg.peerDependencies ?? {})) {
    if (optionalPeers[name]?.optional) continue
    if (!resolvesInBundle(target, name)) missing.push(`${pkg.name} peer ${name}`)
  }
}
for (const [from, name, kind] of skipped) console.log(`skipped ${kind} (not installed): ${name}, wanted by ${basename(from)}`)
if (missing.length) throw new Error('bundle is missing packages: ' + missing.join('; '))

// The bundle's package.json: no link:, no dev dependencies, tsx listed.
const bundled = { ...apiPkg, dependencies: {}, devDependencies: undefined }
for (const [dep, spec] of Object.entries(apiPkg.dependencies ?? {})) {
  bundled.dependencies[dep] = String(spec).startsWith('link:') ? (versions.get(dep) ?? '*') : spec
}
bundled.dependencies.tsx = versions.get('tsx')
writeFileSync(join(destApi, 'package.json'), JSON.stringify(bundled, null, 2) + '\n')

console.log(`api assembled: ${placedAt.size} packages copied, tsx ${versions.get('tsx')}`)

// Usage: node assemble-api.mjs <apps/api dir> <destination apps/api dir>
//
// Builds the API folder of the bundle from the workspace install, with real copies only:
//  - the API's own files (not node_modules, tests, .env),
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

const SKIP_IN_API = new Set(['node_modules', 'test', '.env', 'vitest.config.ts', 'Dockerfile'])
const SKIP_IN_PACKAGE = new Set(['node_modules', '.turbo', '.vite-temp', 'test', 'coverage', '.git'])

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

mkdirSync(destApi, { recursive: true })
cpSync(apiDir, destApi, {
  recursive: true,
  dereference: true,
  filter: (src) => {
    const rel = relative(resolve(apiDir), src)
    return !(SKIP_IN_API.has(rel) || rel.endsWith('.stackdump'))
  },
})

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

/** Copy `name` (found from `fromRealDir`) for the package installed at `parentDir`; returns nothing. */
function place(name, fromRealDir, parentDir, kind) {
  const realDir = findPackageDir(fromRealDir, name)
  if (!realDir) {
    if (kind === 'required') throw new Error(`cannot find ${name} from ${fromRealDir}`)
    return
  }
  let target = join(rootModules, name)
  if (placedAt.has(target) && placedAt.get(target) !== realDir) target = join(parentDir, 'node_modules', name)
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
  for (const dep of Object.keys(pkg.peerDependencies ?? {})) place(dep, realDir, target, 'optional')
}

const apiReal = realpathSync(apiDir)
const apiPkg = readJson(join(apiDir, 'package.json'))
for (const dep of Object.keys(apiPkg.dependencies ?? {})) place(dep, apiReal, destApi, 'required')
place('tsx', apiReal, destApi, 'required')

// The bundle's package.json: no link:, no dev dependencies, tsx listed.
const bundled = { ...apiPkg, dependencies: {}, devDependencies: undefined }
for (const [dep, spec] of Object.entries(apiPkg.dependencies ?? {})) {
  bundled.dependencies[dep] = String(spec).startsWith('link:') ? (versions.get(dep) ?? '*') : spec
}
bundled.dependencies.tsx = versions.get('tsx')
writeFileSync(join(destApi, 'package.json'), JSON.stringify(bundled, null, 2) + '\n')

console.log(`api assembled: ${placedAt.size} packages copied, tsx ${versions.get('tsx')}`)

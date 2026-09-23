/**
 * Pack the bundle without dev tooling: consumers only need the built `lib/`,
 * and shipping devDependencies makes the profile install fetch esbuild and
 * typescript from the registry. Builds, stages a minimal package.json next to
 * every `files` entry plus README.md, and packs there.
 * @remarks Staging follows the manifest's `files` list, so a declared asset
 * directory (e.g. `sounds`) ships without a matching change here.
 */
import { execSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const staging = join(pkgDir, '.pack-staging')

execSync('pnpm run build', { cwd: pkgDir, stdio: 'inherit' })

const pkg = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'))
const shipped = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  type: pkg.type,
  main: pkg.main,
  files: pkg.files,
  license: pkg.license,
  dependencies: pkg.dependencies ?? {},
  dsh: pkg.dsh,
}

await rm(staging, { recursive: true, force: true })
await mkdir(staging, { recursive: true })
await writeFile(join(staging, 'package.json'), `${JSON.stringify(shipped, null, 2)}\n`)
for (const entry of pkg.files ?? []) {
  await cp(join(pkgDir, entry), join(staging, entry), { recursive: true })
}
await cp(join(pkgDir, 'README.md'), join(staging, 'README.md'))
execSync('pnpm pack --pack-destination ..', { cwd: staging, stdio: 'inherit' })
await rm(staging, { recursive: true, force: true })

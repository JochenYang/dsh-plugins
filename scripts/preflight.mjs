#!/usr/bin/env node
/**
 * 发布前回归检查，来自 docs/incidents.md 的「事故即用例」：
 * 1. 每个包的 typecheck（含 client 侧）都要通过；
 * 2. 每个 profile 的 file: spec 必须指向真实存在的 tgz，且文件名版本与源码一致。
 *
 * 用法：node scripts/preflight.mjs
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const failures = []

/** 未安装且不再维护的包；恢复维护时从这里删掉。 */
const SKIP_PACKAGES = new Set(['dsh-pet'])

function manifestOf(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function runTypeGates() {
  const packagesDir = join(repo, 'packages')
  for (const name of readdirSync(packagesDir).sort()) {
    if (SKIP_PACKAGES.has(name)) continue
    const packageDir = join(packagesDir, name)
    const manifestPath = join(packageDir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const scripts = manifestOf(manifestPath).scripts ?? {}
    for (const script of ['typecheck', 'typecheck:client']) {
      if (scripts[script] === undefined) continue
      process.stdout.write(`${name}: ${script} ... `)
      try {
        execSync(`pnpm run ${script}`, { cwd: packageDir, stdio: 'pipe' })
        console.log('ok')
      } catch (error) {
        console.log('FAIL')
        const detail = String(error.stdout ?? '').trim().split('\n').slice(-8).join('\n')
        failures.push(`${name}: ${script} 失败\n${detail}`)
      }
    }
  }
}

function checkProfileSpecs() {
  const profilesDir = join(dshHome, 'profiles')
  if (!existsSync(profilesDir)) return
  let checked = 0
  for (const profile of readdirSync(profilesDir).sort()) {
    const manifestPath = join(profilesDir, profile, 'package.json')
    if (!existsSync(manifestPath)) continue
    const dependencies = manifestOf(manifestPath).dependencies ?? {}
    for (const [name, spec] of Object.entries(dependencies)) {
      if (typeof spec !== 'string' || !spec.startsWith('file:')) continue
      checked += 1
      const file = spec.slice('file:'.length)
      const target = resolve(join(profilesDir, profile), file)
      if (!existsSync(target)) {
        failures.push(`${profile}: ${name} 的 spec 指向不存在的文件\n  ${file}`)
        continue
      }
      const localManifest = join(repo, 'packages', name, 'package.json')
      if (!existsSync(localManifest)) continue
      const version = manifestOf(localManifest).version
      const packed = /-([0-9][^/\\]*)\.tgz$/u.exec(file)?.[1]
      if (packed !== version) {
        failures.push(`${profile}: ${name} 的 spec 版本 ${packed ?? '（无法识别）'} 与源码 ${version} 不一致`)
      }
    }
  }
  console.log(`profile spec: 检查了 ${checked} 条 file: 依赖`)
}

runTypeGates()
checkProfileSpecs()

if (failures.length === 0) {
  console.log('\npreflight: 全部通过')
  process.exit(0)
}
console.error(`\npreflight: ${failures.length} 项失败`)
for (const failure of failures) console.error(`\n- ${failure}`)
process.exit(1)

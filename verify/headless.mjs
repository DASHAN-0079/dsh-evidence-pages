// Run from a source checkout after npm ci; all profile changes stay in a new temporary home.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.argv.length !== 4) throw new Error('Usage: node verify/headless.mjs <path-to-dsh-cli-bin.js> <packed-plugin.tgz>')
const cli = resolve(process.argv[2])
const archive = resolve(process.argv[3])
const dir = mkdtempSync(join(tmpdir(), 'dsh-evidence-'))
const env = { ...process.env, DSH_HOME: join(dir, 'home'), DSH_TELEMETRY_DISABLED: '1',
  DSH_EVIDENCE_SMOKE_RESULT: join(dir, 'result.json') }
for (const key of Object.keys(env)) {
  if (key === 'DSH_EVIDENCE_POLICY' || key.startsWith('DSH_EVIDENCE_JEV_')) delete env[key]
}
function dsh(...args) {
  return execFileSync(process.execPath, [cli, ...args], {
    env, cwd: dir, encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'inherit']
  })
}
const headless = ['--profile', 'headless']
const activation = fileURLToPath(new URL('../preset/headless.patch.yml', import.meta.url))
const probe = fileURLToPath(new URL('./probe.mjs', import.meta.url)).replaceAll('\\', '/')
const probePatch = join(dir, 'probe.yml')
writeFileSync(probePatch, '- id: headless-runner\n  disabled: true\n- insert:\n    - id: release-smoke-probe\n      name: ' + JSON.stringify(probe) + '\n')
assert.match(dsh('--version'), /\b0\.2\.2-rc\.5\b/)
const before = dsh(...headless, '--dump-config')
assert.doesNotMatch(before, /dsh-evidence-pages|superagent|jevos/i)
dsh('plugin', ...headless, 'add', archive)
try {
  const config = dsh(...headless, '--patch', activation, '--dump-config')
  for (const id of ['evidence-page-compaction', 'evidence-page-pruner', 'evidence-page-reader']) {
    assert.ok(config.includes('id: ' + id))
  }
  dsh(...headless, '--patch', activation, '--patch', probePatch, 'Check the local compression fixture')
  console.log(readFileSync(env.DSH_EVIDENCE_SMOKE_RESULT, 'utf8'))
} finally {
  dsh('plugin', ...headless, 'remove', 'dsh-evidence-pages')
}
assert.equal(dsh(...headless, '--dump-config'), before)
console.log('PASS: restored the original headless profile. Verification directory:', dir)

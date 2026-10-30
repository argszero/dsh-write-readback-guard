/** What the published artifact promises, checked against what it ships. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as entry from '../lib/index.js'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
const patch = readFileSync(new URL('cordis.patch.yml', root), 'utf8')

test('the entry exports what a loader row and the tests reach for', () => {
  assert.equal(entry.name, 'write-readback-guard')
  assert.deepEqual([...entry.inject], ['tools', 'fs'])
  assert.equal(typeof entry.apply, 'function')
  assert.equal(entry.default.name, entry.name)
  assert.equal(entry.default.apply, entry.apply)
})

test('the bundle row names this package, and its id matches the plugin name', () => {
  assert.match(patch, /name: '@argszero\/dsh-write-readback-guard'/)
  assert.match(patch, new RegExp(`id: ${entry.name}`))
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
})

test('the package installs nothing at runtime', () => {
  assert.equal(manifest.dependencies, undefined, 'zero runtime dependencies is the contract')
  assert.deepEqual(Object.keys(manifest.peerDependencies).filter(k => k !== '@deepseek-ai/dsh-tools' && k !== '@deepseek-ai/cordis'), [])
})

test('the peer range admits the line the reports run on', () => {
  const range = manifest.peerDependencies['@deepseek-ai/dsh-tools']
  // The reported sessions are on 0.2.1-rc.2/rc.3; 0.2.1-rc.5 is now `latest`.
  assert.match(range, />=0\.2\.1-rc\.2/)
  assert.match(range, /<0\.3\.0/)
})

test('the shipped files include the bundle patch and the entry module', () => {
  assert.ok(manifest.files.includes('cordis.patch.yml'))
  assert.ok(manifest.files.some(glob => glob.startsWith('lib/**/*.js')))
  assert.equal(manifest.main, 'lib/index.js')
})

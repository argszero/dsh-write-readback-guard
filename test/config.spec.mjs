/** Configuration defaults and refusals. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MAX_BYTES, DEFAULT_TOOLS, normalizeConfig } from '../lib/index.js'

test('the defaults watch the two shipped mutation tools and verify', () => {
  const settings = normalizeConfig()
  assert.equal(settings.mode, 'verify')
  assert.deepEqual([...settings.tools], [...DEFAULT_TOOLS])
  assert.equal(settings.maxBytes, DEFAULT_MAX_BYTES)
  assert.equal(settings.normalizeLineEndings, true)
  assert.equal(settings.report, true)
})

test('a supplied list is copied, not aliased', () => {
  const tools = ['write']
  const settings = normalizeConfig({ tools })
  tools.push('edit')
  assert.deepEqual([...settings.tools], ['write'])
})

test('values this plugin cannot honour are refused at mount', () => {
  assert.throws(() => normalizeConfig({ mode: 'fix' }), /mode must be one of/)
  assert.throws(() => normalizeConfig({ tools: [''] }), /non-empty tool names/)
  assert.throws(() => normalizeConfig({ tools: 'write' }), /non-empty tool names/)
  assert.throws(() => normalizeConfig({ maxBytes: 0 }), /positive integer/)
  assert.throws(() => normalizeConfig({ maxBytes: 1.5 }), /positive integer/)
})

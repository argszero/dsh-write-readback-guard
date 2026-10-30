/** The pure half: claim extraction, comparison and wording. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { claimFromValue, disagreementFeedback, firstDifference, verdictFor } from '../lib/index.js'

test('a claim needs both a path and an after string', () => {
  assert.deepEqual(claimFromValue({ path: '/a', after: 'x' }), { path: '/a', expected: 'x' })
  assert.deepEqual(claimFromValue({ path: '/a', after: 'x', operation: 'create' }), { path: '/a', expected: 'x', operation: 'create' })
})

test('anything without a testable claim is not a claim', () => {
  for (const value of [
    undefined, null, 'text', 42, [], [{ path: '/a', after: 'x' }],
    {}, { path: '/a' }, { after: 'x' }, { path: '', after: 'x' },
    { path: '/a', after: 1 }, { path: 7, after: 'x' },
    { content: 'hello' }, { file_path: '/a', content: 'x' },
  ]) {
    assert.equal(claimFromValue(value), undefined, `expected no claim from ${JSON.stringify(value)}`)
  }
})

test('identical content matches, different content does not', () => {
  const claim = claimFromValue({ path: '/a', after: 'hello' })
  assert.equal(verdictFor(claim, 'hello'), 'match')
  assert.equal(verdictFor(claim, 'hellO'), 'mismatch')
  assert.equal(verdictFor(claim, 'hello '), 'mismatch')
})

test('CRLF on disk agrees with the LF-normalized after the tools report', () => {
  const claim = claimFromValue({ path: '/a', after: 'one\ntwo\n' })
  assert.equal(verdictFor(claim, 'one\r\ntwo\r\n'), 'match')
  assert.equal(verdictFor(claim, 'one\r\ntwo\r\n', false), 'mismatch')
})

test('a lone CR is content, not a line ending', () => {
  const claim = claimFromValue({ path: '/a', after: 'a\nb' })
  assert.equal(verdictFor(claim, 'a\rb'), 'mismatch')
})

test('the first difference is reported at the index it happens', () => {
  assert.equal(firstDifference('abc', 'abc'), 3)
  assert.equal(firstDifference('abc', 'abd'), 2)
  assert.equal(firstDifference('ab', 'abc'), 2)
  assert.equal(firstDifference('', 'abc'), 0)
})

test('the absent wording says the write did not land, without guessing why', () => {
  const text = disagreementFeedback('write', { path: '/w/a.md', expected: 'x' })
  assert.match(text, /reported success for \/w\/a\.md/)
  assert.match(text, /No file exists at that path/)
  assert.match(text, /Do not report this change as done/)
  assert.doesNotMatch(text, /permission|ACL|disk full/, 'the guard must not invent a cause')
})

test('the mismatch wording carries both sizes and the first difference', () => {
  const text = disagreementFeedback('edit', { path: '/w/b.md', expected: 'abc' }, 'abX')
  assert.match(text, /claimed 3 characters, found 3/)
  assert.match(text, /first difference at character 2/)
})

/**
 * The four arms, on the real pipeline: the real `@deepseek-ai/dsh-tools` dispatch,
 * the real `@deepseek-ai/dsh-tool-fs` `write`/`edit` tools, and a filesystem that
 * can be told to keep nothing.
 *
 * A control   — without the plugin the false success reaches the model.
 * B treatment — with it, the same call becomes a stated failure.
 * C fail-open — a claim that cannot be read back is passed through and counted.
 * D must-not-fix — a genuine failure is never touched, and a healthy write is
 *                  byte-identical to the control's.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { memoryFs, texts, world } from './harness.mjs'

const NOTE = '/w/note.md'

test('A control: without the plugin a write that kept nothing still reports success', async () => {
  const w = await world()
  w.memory.state.lie = true
  const result = await w.call('write', { file_path: NOTE, content: 'hello' })
  assert.equal(result.isError, false, 'the shipped tool reports success')
  assert.match(texts(result), /Created file/)
  assert.deepEqual([...w.memory.files.keys()], [], 'and nothing was written')
})

test('B treatment: with the plugin the same call becomes a failure the model can act on', async () => {
  const w = await world()
  await w.mount()
  w.memory.state.lie = true
  const result = await w.call('write', { file_path: NOTE, content: 'hello' })
  assert.equal(result.isError, true)
  const text = texts(result)
  assert.match(text, /reported success for \/w\/note\.md/)
  assert.match(text, /No file exists at that path/)
  assert.match(text, /Do not report this change as done/)
  assert.equal(w.ctx.get('writeReadbackGuard').snapshot().counters.caught, 1)
})

test('B treatment: an edit that kept nothing is caught the same way', async () => {
  const w = await world({ fs: memoryFs({ files: [['/w/e.md', 'line one\nline two\n']] }) })
  await w.mount()
  w.memory.state.lie = true
  const result = await w.call('edit', { file_path: '/w/e.md', old_string: 'line two', new_string: 'line 2' })
  assert.equal(result.isError, true)
  assert.match(texts(result), /The file exists, but its content is not the content the tool said it wrote/)
  assert.equal(w.memory.files.get('/w/e.md'), 'line one\nline two\n', 'the file really did not change')
})

test('C fail-open: a file that cannot be read is passed through untouched and counted', async () => {
  // The file must exist for the read to be attempted at all: an absent file is
  // the defect this guard reports, not a case it declines.
  const w = await world({ fs: memoryFs({ files: [[NOTE, 'old content']] }) })
  await w.mount()
  w.memory.state.lie = true
  w.memory.state.readThrows = 'FS_BINARY: not UTF-8 text'
  const result = await w.call('write', { file_path: NOTE, content: 'hello' })
  assert.equal(result.isError, false, 'an unreadable witness is not evidence')
  assert.match(texts(result), /Updated file/)
  const counters = w.ctx.get('writeReadbackGuard').snapshot().counters
  assert.equal(counters.unprovable, 1)
  assert.equal(counters.caught, 0)
})

test('C fail-open: resolve and stat failures are unprovable too, not failures', async () => {
  const w = await world()
  await w.mount()
  w.memory.state.lie = true
  w.memory.state.statThrows = 'FS_IO_ERROR: cannot inspect'
  const result = await w.call('write', { file_path: NOTE, content: 'hello' })
  assert.equal(result.isError, false)
  assert.equal(w.ctx.get('writeReadbackGuard').snapshot().counters.unprovable, 1)
})

test('C fail-open: a healthy write above maxBytes is left alone', async () => {
  const w = await world({ fs: memoryFs({ files: [['/w/big.md', 'x'.repeat(64)]] }) })
  await w.mount({ maxBytes: 16 })
  const result = await w.call('write', { file_path: '/w/big.md', content: 'x'.repeat(64) })
  assert.equal(result.isError, false)
  assert.equal(w.ctx.get('writeReadbackGuard').snapshot().counters.unprovable, 1)
})

test('D must-not-fix: a genuine tool failure is never turned into anything else', async () => {
  const w = await world()
  await w.mount()
  const result = await w.call('edit', { file_path: '/w/missing.md', old_string: 'a', new_string: 'b' })
  assert.equal(result.isError, true, 'it was already an error')
  const text = texts(result)
  assert.doesNotMatch(text, /read-back disagrees/, 'the guard must not claim credit for a tool failure')
  assert.equal(w.ctx.get('writeReadbackGuard').snapshot().counters.alreadyFailed, 1)
  assert.equal(w.ctx.get('writeReadbackGuard').snapshot().counters.caught, 0)
})

test('D must-not-fix: a write that genuinely landed produces no output at all', async () => {
  const control = await world()
  const treated = await world()
  await treated.mount()
  const a = await control.call('write', { file_path: NOTE, content: 'hello' })
  const b = await treated.call('write', { file_path: NOTE, content: 'hello' })
  assert.equal(b.isError, a.isError)
  assert.equal(texts(b), texts(a), 'the healthy path adds nothing to the result')
  assert.equal(JSON.stringify(b.content), JSON.stringify(a.content))
  assert.deepEqual(treated.memory.files.get(NOTE), 'hello')
  const counters = treated.ctx.get('writeReadbackGuard').snapshot().counters
  assert.equal(counters.passed, 1)
  assert.equal(counters.caught, 0)
})

test('D must-not-fix: a genuine edit that landed is passed through unchanged', async () => {
  const treated = await world({ fs: memoryFs({ files: [['/w/e.md', 'a\nb\n']] }) })
  await treated.mount()
  const result = await treated.call('edit', { file_path: '/w/e.md', old_string: 'b', new_string: 'c' })
  assert.equal(result.isError, false)
  assert.match(texts(result), /updated successfully/)
  assert.equal(treated.memory.files.get('/w/e.md'), 'a\nc\n')
  assert.equal(treated.ctx.get('writeReadbackGuard').snapshot().counters.passed, 1)
})

test('observe mode counts what verify would have caught and decides nothing', async () => {
  const w = await world()
  await w.mount({ mode: 'observe' })
  w.memory.state.lie = true
  const result = await w.call('write', { file_path: NOTE, content: 'hello' })
  assert.equal(result.isError, false, 'observe never changes a result')
  const counters = w.ctx.get('writeReadbackGuard').snapshot().counters
  assert.equal(counters.wouldCatch, 1)
  assert.equal(counters.caught, 0)
})

test('a tool outside the watched list is never inspected', async () => {
  const w = await world()
  await w.mount({ tools: ['nothing_here'] })
  w.memory.state.lie = true
  const result = await w.call('write', { file_path: NOTE, content: 'hello' })
  assert.equal(result.isError, false)
  const counters = w.ctx.get('writeReadbackGuard').snapshot().counters
  assert.equal(counters.caught + counters.passed + counters.unprovable, 0)
})

test('unmounting restores the runtime: the next lie passes through again', async () => {
  const w = await world()
  await w.mount()
  w.memory.state.lie = true
  assert.equal((await w.call('write', { file_path: NOTE, content: 'a' })).isError, true)
  await w.dispose()
  assert.equal((await w.call('write', { file_path: NOTE, content: 'a' })).isError, false)
})

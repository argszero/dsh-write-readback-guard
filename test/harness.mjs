/**
 * The integration harness: a REAL cordis context, the REAL `@deepseek-ai/dsh-tools`
 * dispatch pipeline, the REAL `@deepseek-ai/dsh-tool-fs` `write`/`edit` tools —
 * over a filesystem backend that can be told to lie.
 *
 * The lying backend is the point, not a shortcut. The reported defect is not a
 * tool that forgot to write; it is a tool that *reports* a write it trusts its
 * backend for. `write` renders `<content>Created file</content>` from
 * `outcome.operation` and `edit` renders "updated successfully" from its own
 * success path, and neither re-opens the file. So the only way to reproduce the
 * report faithfully is to let the shipped code run and have the filesystem
 * decline to keep the bytes — which is what a failing disk, a refused ACL or a
 * lost round-trip looks like from the tool's side.
 *
 * @module test/harness
 */

import { Context } from '@deepseek-ai/cordis'
import systemPrompt from '@deepseek-ai/dsh-system-prompt'
import toolsPlugin from '@deepseek-ai/dsh-tools'
import { Config as toolFsConfig, apply as applyToolFs, inject as toolFsInject, name as toolFsName } from '@deepseek-ai/dsh-tool-fs'
import * as plugin from '../lib/index.js'

/** Let a mount's effects settle. Cordis applies effects asynchronously. */
export async function settle(milliseconds = 25) {
  await new Promise(resolve => setTimeout(resolve, milliseconds))
}

/**
 * An in-memory filesystem that can be told to accept a mutation and keep nothing.
 * @param options - `lie` makes every mutation report success without storing.
 * @returns the service object, the backing map, and a way to break reading.
 */
export function memoryFs(options = {}) {
  const files = new Map(options.files ?? [])
  const calls = []
  const state = { lie: options.lie ?? false, readThrows: undefined, statThrows: undefined }
  const target = path => ({ targetKey: path, displayPath: path })
  const service = {
    async resolve(path) { return target(path) },
    processPath(entry) { return entry.targetKey },
    fileUrl(entry) { return `file://${entry.targetKey}` },
    contains(parent, child) { return child.targetKey.startsWith(parent.targetKey) },
    async stat(entry) {
      if (state.statThrows !== undefined) throw new Error(state.statThrows)
      const content = files.get(entry.targetKey)
      return content === undefined ? undefined : { size: content.length, kind: 'file' }
    },
    async readText(entry) {
      if (state.readThrows !== undefined) throw new Error(state.readThrows)
      const content = files.get(entry.targetKey)
      if (content === undefined) throw new Error(`FS_NOT_FOUND: ${entry.targetKey}`)
      return content
    },
    async writeText(entry, content) {
      calls.push({ op: 'write', path: entry.targetKey, content })
      const existed = files.has(entry.targetKey)
      if (!state.lie) files.set(entry.targetKey, content)
      return {
        operation: existed ? 'update' : 'create',
        version: `v${calls.length}`,
        before: existed ? (files.get(entry.targetKey) ?? null) : null,
        after: content,
      }
    },
    async editText(entry, edit) {
      calls.push({ op: 'edit', path: entry.targetKey, edit })
      const current = files.get(entry.targetKey)
      if (current === undefined) throw new Error(`FS_NOT_FOUND: ${entry.targetKey}`)
      const after = current.split(edit.oldString).join(edit.newString)
      if (!state.lie) files.set(entry.targetKey, after)
      return { version: `v${calls.length}`, before: current, after }
    },
  }
  return { service, files, state, calls }
}

/**
 * Build the world: system prompt, tool registry, the shipped fs tools over the
 * given filesystem, and optionally this plugin mounted.
 * @param spec - the filesystem, and whether to mount the guard.
 * @returns the context, the filesystem, the mount, and a dispatch helper.
 */
export async function world(spec = {}) {
  const memory = spec.fs ?? memoryFs()
  const ctx = new Context()
  await ctx.plugin(systemPrompt)
  await ctx.provide('fs', memory.service)
  // `tool-fs` injects `workingDirectory`; with no agent on a dispatch the tool
  // never asks it for a cwd, so the stub only has to exist for the fiber to activate.
  await ctx.provide('workingDirectory', { async ensure() { return undefined } })
  await ctx.plugin(toolsPlugin)
  await ctx.plugin({ name: toolFsName, inject: toolFsInject, apply: applyToolFs }, toolFsConfig({ read: false, readImage: false, write: true, edit: true }))
  await settle()
  let fork
  const guardConfig = spec.config ?? {}
  return {
    ctx,
    memory,
    async mount(config = guardConfig) {
      fork = await ctx.plugin(plugin, config)
      await settle()
      return fork
    },
    async dispose() { await fork?.dispose(); fork = undefined; await settle() },
    /**
     * Dispatch one call through the real pipeline.
     * @param name - the tool name.
     * @param args - the tool arguments.
     * @returns the settled result the loop would record.
     */
    async call(name, args) {
      return ctx.tools.execute({
        callId: `call-${name}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        arguments: args,
        signal: AbortSignal.timeout(5_000),
      })
    },
  }
}

/** The text a model sees in a result, flattened. */
export function texts(result) {
  return (result.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n')
}

/**
 * The service the mount provides: the counters, the log, and the one check.
 * @module guard
 */

import type { Settings } from './config.ts'
import { claimFromValue, disagreementFeedback, verdictFor } from './verify.ts'
import type { Claim } from './verify.ts'

/** How many recent decisions the log keeps. */
export const CHANGE_LOG_LIMIT = 50

/** What one mount has seen, by outcome. */
export interface Counters {
  /** Successful results of a watched tool that were read back and agreed. */
  passed: number
  /** Results turned into a failure because the disk disagreed. */
  caught: number
  /** Claims left alone because the file could not be read (binary, too large, denied). */
  unprovable: number
  /** Results of a watched tool that carried no claim this guard could test. */
  unreadableResult: number
  /** Calls of a watched tool that already failed: never a lie, never touched. */
  alreadyFailed: number
  /** Observed while `mode` was `observe`: what `verify` would have caught. */
  wouldCatch: number
}

/** One decision, kept for the log and for a later reader. */
export interface Change {
  readonly at: string
  readonly tool: string
  readonly path: string
  readonly outcome: 'caught' | 'would-catch' | 'unprovable' | 'unreadable-result'
  readonly detail: string
}

/** The shape `ctx.writeReadbackGuard` satisfies. */
export interface WriteReadbackGuardService {
  readonly settings: Settings
  snapshot(): { counters: Counters; changes: readonly Change[] }
}

/** The filesystem members this guard uses, typed locally: no runtime import. */
interface FsLike {
  resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<unknown>
  stat(target: unknown, signal?: AbortSignal): Promise<{ size?: number } | undefined>
  readText(target: unknown, signal?: AbortSignal): Promise<string>
}

/** One successful result handed to {@link WriteReadbackGuard.inspect}. */
export interface Inspection {
  readonly toolName: string
  readonly result: { readonly isError: boolean; readonly value?: unknown }
  readonly signal?: AbortSignal
}

/** The decision a caller applies, or `undefined` to leave the result alone. */
export type Verdict = { readonly kind: 'block'; readonly feedback: string } | undefined

/** Counters plus the bounded log behind one mount. */
export class WriteReadbackGuard implements WriteReadbackGuardService {
  readonly settings: Settings
  readonly #fs: FsLike
  readonly #log: (message: string) => void
  #counters: Counters = {
    passed: 0, caught: 0, unprovable: 0, unreadableResult: 0, alreadyFailed: 0, wouldCatch: 0,
  }
  #changes: Change[] = []

  constructor(settings: Settings, fs: FsLike, log: (message: string) => void) {
    this.settings = settings
    this.#fs = fs
    this.#log = log
  }

  snapshot(): { counters: Counters; changes: readonly Change[] } {
    return { counters: { ...this.#counters }, changes: [...this.#changes] }
  }

  /**
   * Test one successful result against the disk.
   * @param inspection - the tool name, the result, and the call's signal.
   * @returns a `block` decision when the disk disagrees, otherwise `undefined`.
   */
  async inspect(inspection: Inspection): Promise<Verdict> {
    const { toolName, result, signal } = inspection
    if (!this.settings.tools.includes(toolName)) return undefined
    if (result.isError) {
      this.#counters.alreadyFailed += 1
      return undefined
    }
    const claim = claimFromValue(result.value)
    if (claim === undefined) {
      this.#counters.unreadableResult += 1
      this.#note(toolName, '', 'unreadable-result', 'the result carried no path/after pair to test')
      return undefined
    }
    const observed = await this.#read(claim, signal)
    if (observed.kind === 'unprovable') {
      this.#counters.unprovable += 1
      this.#note(toolName, claim.path, 'unprovable', observed.reason)
      return undefined
    }
    if (observed.kind === 'absent') {
      return this.#decide(toolName, claim, undefined, 'no file exists at the path the tool reported')
    }
    if (verdictFor(claim, observed.text, this.settings.normalizeLineEndings) === 'match') {
      this.#counters.passed += 1
      return undefined
    }
    return this.#decide(toolName, claim, observed.text, 'the file content is not the claimed content')
  }

  /**
   * Read the claim's path back.
   * @param claim - the claim to test.
   * @param signal - the call's signal.
   * @returns the content, an absent verdict, or the reason it could not be read.
   */
  async #read(claim: Claim, signal?: AbortSignal): Promise<
    | { kind: 'text'; text: string }
    | { kind: 'absent' }
    | { kind: 'unprovable'; reason: string }
  > {
    let target: unknown
    try {
      target = await this.#fs.resolve(claim.path, signal === undefined ? {} : { signal })
    } catch (error: unknown) {
      return { kind: 'unprovable', reason: `the path could not be resolved: ${describe(error)}` }
    }
    let info: { size?: number } | undefined
    try {
      info = await this.#fs.stat(target, signal)
    } catch (error: unknown) {
      return { kind: 'unprovable', reason: `the path could not be inspected: ${describe(error)}` }
    }
    if (info === undefined) return { kind: 'absent' }
    if (typeof info.size === 'number' && info.size > this.settings.maxBytes) {
      return { kind: 'unprovable', reason: `the file is ${info.size} bytes, above maxBytes ${this.settings.maxBytes}` }
    }
    try {
      return { kind: 'text', text: await this.#fs.readText(target, signal) }
    } catch (error: unknown) {
      return { kind: 'unprovable', reason: `the file could not be read: ${describe(error)}` }
    }
  }

  /** Record and return the decision for one disagreement. */
  #decide(toolName: string, claim: Claim, actual: string | undefined, detail: string): Verdict {
    if (this.settings.mode === 'observe') {
      this.#counters.wouldCatch += 1
      this.#note(toolName, claim.path, 'would-catch', detail)
      return undefined
    }
    this.#counters.caught += 1
    this.#note(toolName, claim.path, 'caught', detail)
    return { kind: 'block', feedback: disagreementFeedback(toolName, claim, actual) }
  }

  #note(tool: string, path: string, outcome: Change['outcome'], detail: string): void {
    this.#changes.push({ at: new Date().toISOString(), tool, path, outcome, detail })
    if (this.#changes.length > CHANGE_LOG_LIMIT) this.#changes.shift()
    if (this.settings.report) this.#log(`${tool}${path === '' ? '' : ` ${path}`}: ${outcome} — ${detail}`)
  }
}

/** A short, bounded description of a thrown value. */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

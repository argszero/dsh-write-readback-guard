/**
 * Configuration for the read-back guard, and the defaults it ships with.
 * @module config
 */

/** What the guard does with a disagreeing read-back. */
export type Mode =
  /** Turn a disagreement into a failure the model can act on. */
  | 'verify'
  /** Never decide anything; count what `verify` would have caught. */
  | 'observe'
  /** Mount nothing. */
  | 'off'

/** Every accepted mode, in documentation order. */
export const MODES: readonly Mode[] = ['verify', 'observe', 'off']

/** The tool names this guard knows how to read a claim out of. */
export const DEFAULT_TOOLS: readonly string[] = ['write', 'edit']

/**
 * Largest file the guard will read back, in bytes. A claim about a larger file
 * is passed through and counted rather than truncated into a false match.
 */
export const DEFAULT_MAX_BYTES = 1_048_576

/** Raw plugin configuration as a row supplies it. */
export interface Config {
  mode?: Mode
  tools?: readonly string[]
  maxBytes?: number
  normalizeLineEndings?: boolean
  report?: boolean
}

/** Configuration after defaults and validation. */
export interface Settings {
  mode: Mode
  tools: readonly string[]
  maxBytes: number
  normalizeLineEndings: boolean
  report: boolean
}

/**
 * Apply defaults and reject values this plugin cannot honour.
 * @param config - the row's configuration.
 * @returns the settings the mount uses.
 */
export function normalizeConfig(config: Config = {}): Settings {
  const mode = config.mode ?? 'verify'
  if (!MODES.includes(mode)) {
    throw new TypeError(`mode must be one of ${MODES.join(', ')}; received ${String(mode)}`)
  }
  const tools = config.tools ?? DEFAULT_TOOLS
  if (!Array.isArray(tools) || tools.some(name => typeof name !== 'string' || name.length === 0)) {
    throw new TypeError('tools must be an array of non-empty tool names')
  }
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError(`maxBytes must be a positive integer; received ${String(maxBytes)}`)
  }
  return {
    mode,
    tools: [...tools],
    maxBytes,
    normalizeLineEndings: config.normalizeLineEndings ?? true,
    report: config.report ?? true,
  }
}

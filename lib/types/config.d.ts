/**
 * Configuration for the read-back guard, and the defaults it ships with.
 * @module config
 */
/** What the guard does with a disagreeing read-back. */
export type Mode = 
/** Turn a disagreement into a failure the model can act on. */
'verify'
/** Never decide anything; count what `verify` would have caught. */
 | 'observe'
/** Mount nothing. */
 | 'off';
/** Every accepted mode, in documentation order. */
export declare const MODES: readonly Mode[];
/** The tool names this guard knows how to read a claim out of. */
export declare const DEFAULT_TOOLS: readonly string[];
/**
 * Largest file the guard will read back, in bytes. A claim about a larger file
 * is passed through and counted rather than truncated into a false match.
 */
export declare const DEFAULT_MAX_BYTES = 1048576;
/** Raw plugin configuration as a row supplies it. */
export interface Config {
    mode?: Mode;
    tools?: readonly string[];
    maxBytes?: number;
    normalizeLineEndings?: boolean;
    report?: boolean;
}
/** Configuration after defaults and validation. */
export interface Settings {
    mode: Mode;
    tools: readonly string[];
    maxBytes: number;
    normalizeLineEndings: boolean;
    report: boolean;
}
/**
 * Apply defaults and reject values this plugin cannot honour.
 * @param config - the row's configuration.
 * @returns the settings the mount uses.
 */
export declare function normalizeConfig(config?: Config): Settings;
//# sourceMappingURL=config.d.ts.map
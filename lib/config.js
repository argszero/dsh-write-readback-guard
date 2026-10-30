/**
 * Configuration for the read-back guard, and the defaults it ships with.
 * @module config
 */
/** Every accepted mode, in documentation order. */
export const MODES = ['verify', 'observe', 'off'];
/** The tool names this guard knows how to read a claim out of. */
export const DEFAULT_TOOLS = ['write', 'edit'];
/**
 * Largest file the guard will read back, in bytes. A claim about a larger file
 * is passed through and counted rather than truncated into a false match.
 */
export const DEFAULT_MAX_BYTES = 1_048_576;
/**
 * Apply defaults and reject values this plugin cannot honour.
 * @param config - the row's configuration.
 * @returns the settings the mount uses.
 */
export function normalizeConfig(config = {}) {
    const mode = config.mode ?? 'verify';
    if (!MODES.includes(mode)) {
        throw new TypeError(`mode must be one of ${MODES.join(', ')}; received ${String(mode)}`);
    }
    const tools = config.tools ?? DEFAULT_TOOLS;
    if (!Array.isArray(tools) || tools.some(name => typeof name !== 'string' || name.length === 0)) {
        throw new TypeError('tools must be an array of non-empty tool names');
    }
    const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        throw new TypeError(`maxBytes must be a positive integer; received ${String(maxBytes)}`);
    }
    return {
        mode,
        tools: [...tools],
        maxBytes,
        normalizeLineEndings: config.normalizeLineEndings ?? true,
        report: config.report ?? true,
    };
}

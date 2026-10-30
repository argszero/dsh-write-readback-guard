/**
 * The service the mount provides: the counters, the log, and the one check.
 * @module guard
 */
import { claimFromValue, disagreementFeedback, verdictFor } from "./verify.js";
/** How many recent decisions the log keeps. */
export const CHANGE_LOG_LIMIT = 50;
/** Counters plus the bounded log behind one mount. */
export class WriteReadbackGuard {
    settings;
    #fs;
    #log;
    #counters = {
        passed: 0, caught: 0, unprovable: 0, unreadableResult: 0, alreadyFailed: 0, wouldCatch: 0,
    };
    #changes = [];
    constructor(settings, fs, log) {
        this.settings = settings;
        this.#fs = fs;
        this.#log = log;
    }
    snapshot() {
        return { counters: { ...this.#counters }, changes: [...this.#changes] };
    }
    /**
     * Test one successful result against the disk.
     * @param inspection - the tool name, the result, and the call's signal.
     * @returns a `block` decision when the disk disagrees, otherwise `undefined`.
     */
    async inspect(inspection) {
        const { toolName, result, signal } = inspection;
        if (!this.settings.tools.includes(toolName))
            return undefined;
        if (result.isError) {
            this.#counters.alreadyFailed += 1;
            return undefined;
        }
        const claim = claimFromValue(result.value);
        if (claim === undefined) {
            this.#counters.unreadableResult += 1;
            this.#note(toolName, '', 'unreadable-result', 'the result carried no path/after pair to test');
            return undefined;
        }
        const observed = await this.#read(claim, signal);
        if (observed.kind === 'unprovable') {
            this.#counters.unprovable += 1;
            this.#note(toolName, claim.path, 'unprovable', observed.reason);
            return undefined;
        }
        if (observed.kind === 'absent') {
            return this.#decide(toolName, claim, undefined, 'no file exists at the path the tool reported');
        }
        if (verdictFor(claim, observed.text, this.settings.normalizeLineEndings) === 'match') {
            this.#counters.passed += 1;
            return undefined;
        }
        return this.#decide(toolName, claim, observed.text, 'the file content is not the claimed content');
    }
    /**
     * Read the claim's path back.
     * @param claim - the claim to test.
     * @param signal - the call's signal.
     * @returns the content, an absent verdict, or the reason it could not be read.
     */
    async #read(claim, signal) {
        let target;
        try {
            target = await this.#fs.resolve(claim.path, signal === undefined ? {} : { signal });
        }
        catch (error) {
            return { kind: 'unprovable', reason: `the path could not be resolved: ${describe(error)}` };
        }
        let info;
        try {
            info = await this.#fs.stat(target, signal);
        }
        catch (error) {
            return { kind: 'unprovable', reason: `the path could not be inspected: ${describe(error)}` };
        }
        if (info === undefined)
            return { kind: 'absent' };
        if (typeof info.size === 'number' && info.size > this.settings.maxBytes) {
            return { kind: 'unprovable', reason: `the file is ${info.size} bytes, above maxBytes ${this.settings.maxBytes}` };
        }
        try {
            return { kind: 'text', text: await this.#fs.readText(target, signal) };
        }
        catch (error) {
            return { kind: 'unprovable', reason: `the file could not be read: ${describe(error)}` };
        }
    }
    /** Record and return the decision for one disagreement. */
    #decide(toolName, claim, actual, detail) {
        if (this.settings.mode === 'observe') {
            this.#counters.wouldCatch += 1;
            this.#note(toolName, claim.path, 'would-catch', detail);
            return undefined;
        }
        this.#counters.caught += 1;
        this.#note(toolName, claim.path, 'caught', detail);
        return { kind: 'block', feedback: disagreementFeedback(toolName, claim, actual) };
    }
    #note(tool, path, outcome, detail) {
        this.#changes.push({ at: new Date().toISOString(), tool, path, outcome, detail });
        if (this.#changes.length > CHANGE_LOG_LIMIT)
            this.#changes.shift();
        if (this.settings.report)
            this.#log(`${tool}${path === '' ? '' : ` ${path}`}: ${outcome} — ${detail}`);
    }
}
/** A short, bounded description of a thrown value. */
function describe(error) {
    if (error instanceof Error)
        return `${error.name}: ${error.message}`;
    return String(error);
}

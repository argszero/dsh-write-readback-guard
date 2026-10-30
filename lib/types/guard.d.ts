/**
 * The service the mount provides: the counters, the log, and the one check.
 * @module guard
 */
import type { Settings } from './config.ts';
/** How many recent decisions the log keeps. */
export declare const CHANGE_LOG_LIMIT = 50;
/** What one mount has seen, by outcome. */
export interface Counters {
    /** Successful results of a watched tool that were read back and agreed. */
    passed: number;
    /** Results turned into a failure because the disk disagreed. */
    caught: number;
    /** Claims left alone because the file could not be read (binary, too large, denied). */
    unprovable: number;
    /** Results of a watched tool that carried no claim this guard could test. */
    unreadableResult: number;
    /** Calls of a watched tool that already failed: never a lie, never touched. */
    alreadyFailed: number;
    /** Observed while `mode` was `observe`: what `verify` would have caught. */
    wouldCatch: number;
}
/** One decision, kept for the log and for a later reader. */
export interface Change {
    readonly at: string;
    readonly tool: string;
    readonly path: string;
    readonly outcome: 'caught' | 'would-catch' | 'unprovable' | 'unreadable-result';
    readonly detail: string;
}
/** The shape `ctx.writeReadbackGuard` satisfies. */
export interface WriteReadbackGuardService {
    readonly settings: Settings;
    snapshot(): {
        counters: Counters;
        changes: readonly Change[];
    };
}
/** The filesystem members this guard uses, typed locally: no runtime import. */
interface FsLike {
    resolve(path: string, opts?: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<unknown>;
    stat(target: unknown, signal?: AbortSignal): Promise<{
        size?: number;
    } | undefined>;
    readText(target: unknown, signal?: AbortSignal): Promise<string>;
}
/** One successful result handed to {@link WriteReadbackGuard.inspect}. */
export interface Inspection {
    readonly toolName: string;
    readonly result: {
        readonly isError: boolean;
        readonly value?: unknown;
    };
    readonly signal?: AbortSignal;
}
/** The decision a caller applies, or `undefined` to leave the result alone. */
export type Verdict = {
    readonly kind: 'block';
    readonly feedback: string;
} | undefined;
/** Counters plus the bounded log behind one mount. */
export declare class WriteReadbackGuard implements WriteReadbackGuardService {
    #private;
    readonly settings: Settings;
    constructor(settings: Settings, fs: FsLike, log: (message: string) => void);
    snapshot(): {
        counters: Counters;
        changes: readonly Change[];
    };
    /**
     * Test one successful result against the disk.
     * @param inspection - the tool name, the result, and the call's signal.
     * @returns a `block` decision when the disk disagrees, otherwise `undefined`.
     */
    inspect(inspection: Inspection): Promise<Verdict>;
}
export {};
//# sourceMappingURL=guard.d.ts.map
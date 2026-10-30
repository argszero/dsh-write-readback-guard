/**
 * Make a `write`/`edit` success prove itself against the disk before the model
 * is told it happened.
 *
 * ## The gap
 *
 * Both shipped tools answer from the value their filesystem backend returned.
 * `write` renders `<content>Created file</content>` from `outcome.operation`,
 * `edit` renders "The file … has been updated successfully." — and neither
 * re-opens the file. When the bytes do not reach the disk, the tool still
 * reports success, the loop still records a successful `tool/result`, and the
 * model repeats the claim upward. Discussion #11532 documents ten such calls
 * across four files: four `edit`s answering "updated successfully" with the old
 * text still in place, and six `write`s answering "File created" for files that
 * did not exist afterwards.
 *
 * Nothing in the loop can catch it, because nothing reads the file again: a
 * failed write and a succeeded write are the same successful tool result. The
 * model has no reason to doubt it, the user sees no error, and the only
 * detector is whoever happens to `grep` the file later.
 *
 * ## What this plugin does
 *
 * It listens on `tools/post-execute` — the seam that may replace a result, and
 * the one place where a successful result is still a *proposal* rather than
 * history — and tests the tool's own claim. Both tools declare an output
 * carrying `path` and `after`, where `after` is the file's content following
 * the mutation; this guard resolves that path through the same `ctx.fs` the
 * tool wrote through, reads it, and compares.
 *
 * - agree → the result passes through untouched, byte for byte, with no added
 *   text: a healthy write reads exactly as it always did.
 * - disagree → `{ kind: 'block', feedback }`, which the pipeline turns into an
 *   `isError` result. The model is told what was claimed, what was found, where
 *   the first difference is, and that the change must not be reported as done.
 *
 * ## What it will not do
 *
 * It does not retry, rewrite, or delete anything, and it never touches a call
 * that already failed. Every case this guard cannot decide is passed through
 * and counted instead: a result carrying no claim, a binary or oversized file,
 * a target the backend refuses to read. The filesystem is the only witness it
 * has, and a witness that cannot be read is not evidence.
 *
 * **This catches one tool's own false report at one call. It is not a
 * filesystem guarantee** — a file can change after the read-back, and a second
 * reader can disagree with a disk that moved underneath it.
 *
 * @module @argszero/dsh-write-readback-guard
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './config.ts';
import type { WriteReadbackGuardService } from './guard.ts';
export type { Config, Mode, Settings } from './config.ts';
export { DEFAULT_MAX_BYTES, DEFAULT_TOOLS, MODES, normalizeConfig } from './config.ts';
export type { Change, Counters, Inspection, WriteReadbackGuardService } from './guard.ts';
export { CHANGE_LOG_LIMIT, WriteReadbackGuard } from './guard.ts';
export type { Claim, Verdict as ReadbackVerdict } from './verify.ts';
export { claimFromValue, disagreementFeedback, firstDifference, verdictFor } from './verify.ts';
/** Stable Loader identity. */
export declare const name = "write-readback-guard";
/**
 * The registry the result comes from, and the filesystem the claim is tested
 * against. `fs` is a hard requirement rather than an optional read: without a
 * filesystem there is nothing to read back, so mounting without one would
 * promise a guarantee this plugin cannot keep.
 */
export declare const inject: string[];
declare module '@deepseek-ai/cordis' {
    interface Context {
        writeReadbackGuard: WriteReadbackGuardService;
    }
}
/**
 * Mount the guard.
 * @param ctx - the plugin context; `tools` and `fs` are injected.
 * @param config - the row's configuration.
 */
export declare function apply(ctx: Context, config?: Config): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map
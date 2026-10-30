/**
 * The pure half: read the claim out of a tool result, compare it with what the
 * disk actually holds, and word the disagreement for the model.
 *
 * Nothing here touches a context, a file or a service, so every rule below is
 * pinned by a test rather than inferred from a mount.
 * @module verify
 */
/** What one successful `write`/`edit` told the model it had left on disk. */
export interface Claim {
    /** Absolute path the tool reported, as the model sees it. */
    readonly path: string;
    /** The file content the tool says is there now. */
    readonly expected: string;
    /** The tool's own word for what it did, when it said one. */
    readonly operation?: string;
}
/** How a read-back compares with the claim. */
export type Verdict = 
/** The disk holds what the tool said. Nothing to do. */
'match'
/** A file is there, but its content is not the claimed content. */
 | 'mismatch'
/** The tool reported a file at a path that has none. */
 | 'absent';
/**
 * Read the claim out of a result value, or report that there is none.
 *
 * Both shipped tools declare an output schema carrying `path` and `after`
 * (`packages/fs/tool-fs/src/write.ts`, `edit.ts`): `after` is the file's content
 * following the mutation. That is the claim this guard tests — not the
 * arguments the model sent, and not a second opinion about what the file ought
 * to contain. A tool that reports something else is left alone.
 * @param value - the execution-local value of a successful result.
 * @returns the claim, or `undefined` when the value does not carry one.
 */
export declare function claimFromValue(value: unknown): Claim | undefined;
/**
 * Compare a claimed content with the content read back.
 * @param claim - what the tool said is on disk.
 * @param actual - what the filesystem returned for that path.
 * @param normalizeLineEndings - collapse CRLF before comparing. The shipped
 *   tools normalize `after` to LF while the bytes on disk may not be, so a
 *   Windows file would otherwise disagree with itself on every call.
 * @returns the verdict.
 */
export declare function verdictFor(claim: Claim, actual: string, normalizeLineEndings?: boolean): Verdict;
/**
 * Index of the first character where two strings differ, or the shorter length
 * when one is a prefix of the other.
 * @param left - first string.
 * @param right - second string.
 * @returns the 0-based index.
 */
export declare function firstDifference(left: string, right: string): number;
/**
 * Word a disagreement as corrective feedback the model can act on.
 *
 * The text states what was claimed, what was observed, and what to do next. It
 * deliberately does not claim to know *why* the write failed — that is the
 * backend's business and guessing it is how a diagnostic becomes fiction.
 * @param toolName - the tool whose report is being corrected.
 * @param claim - what the tool said.
 * @param actual - what the disk holds, when a file was there.
 * @returns the model-facing text.
 */
export declare function disagreementFeedback(toolName: string, claim: Claim, actual?: string): string;
//# sourceMappingURL=verify.d.ts.map
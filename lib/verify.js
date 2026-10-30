/**
 * The pure half: read the claim out of a tool result, compare it with what the
 * disk actually holds, and word the disagreement for the model.
 *
 * Nothing here touches a context, a file or a service, so every rule below is
 * pinned by a test rather than inferred from a mount.
 * @module verify
 */
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
export function claimFromValue(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const record = value;
    const path = record.path;
    const expected = record.after;
    if (typeof path !== 'string' || path.length === 0)
        return undefined;
    if (typeof expected !== 'string')
        return undefined;
    const operation = record.operation;
    return {
        path,
        expected,
        ...typeof operation === 'string' ? { operation } : {},
    };
}
/**
 * Compare a claimed content with the content read back.
 * @param claim - what the tool said is on disk.
 * @param actual - what the filesystem returned for that path.
 * @param normalizeLineEndings - collapse CRLF before comparing. The shipped
 *   tools normalize `after` to LF while the bytes on disk may not be, so a
 *   Windows file would otherwise disagree with itself on every call.
 * @returns the verdict.
 */
export function verdictFor(claim, actual, normalizeLineEndings = true) {
    const left = normalizeLineEndings ? toLf(claim.expected) : claim.expected;
    const right = normalizeLineEndings ? toLf(actual) : actual;
    return left === right ? 'match' : 'mismatch';
}
/** Collapse CRLF to LF. A lone CR is left alone: it is content, not a line ending. */
function toLf(text) {
    return text.includes('\r\n') ? text.replace(/\r\n/g, '\n') : text;
}
/**
 * Index of the first character where two strings differ, or the shorter length
 * when one is a prefix of the other.
 * @param left - first string.
 * @param right - second string.
 * @returns the 0-based index.
 */
export function firstDifference(left, right) {
    const limit = Math.min(left.length, right.length);
    for (let index = 0; index < limit; index += 1) {
        if (left[index] !== right[index])
            return index;
    }
    return limit;
}
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
export function disagreementFeedback(toolName, claim, actual) {
    const head = `The ${toolName} tool reported success for ${claim.path}, but a read-back disagrees.`;
    if (actual === undefined) {
        return `${head} No file exists at that path, so the write did not land.
Do not report this change as done. Write it again, then read the path before continuing; if it is still absent, the failure is in the filesystem rather than in the arguments, and the work is unfinished.`;
    }
    const at = firstDifference(toLf(claim.expected), toLf(actual));
    return `${head} The file exists, but its content is not the content the tool said it wrote.
  claimed ${claim.expected.length} characters, found ${actual.length}; first difference at character ${at}.
Do not report this change as done. Write it again, then read the path before continuing; if the second read-back also disagrees, the write is not reaching the disk and the work is unfinished.`;
}

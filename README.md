# @argszero/dsh-write-readback-guard

A host plugin for DeepSeek Harness that makes a `write` or `edit` **prove itself
against the disk** before the model is told it happened.

```sh
dsh plugin --profile <name> add "github:argszero/dsh-write-readback-guard#v0.1.0"
```

## What it answers

A `write` or `edit` call can report success while the file is unchanged. The
model is then told "Created file" or "updated successfully", the loop records a
successful `tool/result`, and the agent reports the work as done — while the
file on disk is exactly as it was.

Nothing in the loop can catch this by itself. A write that failed and a write
that succeeded produce the **same successful tool result**: both tools answer
from the value their filesystem backend returned, and neither re-opens the file.
The user sees no error, the model has no reason to doubt it, and the only
detector is whoever happens to read the file later.

Reported in
[discussion #11532](https://github.com/deepseek-ai/deepseek-harness/discussions/11532),
which documents ten such calls across four files: four `edit`s answering
"updated successfully" with the old text still in place, six `write`s answering
"File created" for files that did not exist afterwards.

## How it works

The plugin listens on **`tools/post-execute`** — the seam where a result is
still a proposal and may still be replaced — and tests the tool's own claim.

Both shipped tools declare an output carrying `path` and `after`, where `after`
is the file's content following the mutation. The guard resolves that path
through the same `ctx.fs` the tool wrote through, reads it, and compares:

| the disk | the result |
|---|---|
| holds what the tool claimed | passed through **byte for byte**, nothing added |
| holds different content | `isError`, naming both lengths and the first differing character |
| holds no file at that path | `isError`, saying the write did not land |

The failure text is addressed to the model, because the model is the one that
would otherwise report the work as done:

```
The write tool reported success for /w/note.md, but a read-back disagrees.
No file exists at that path, so the write did not land.
Do not report this change as done. Write it again, then read the path before
continuing; if it is still absent, the failure is in the filesystem rather than
in the arguments, and the work is unfinished.
```

## What it will not do

It does not retry, rewrite, delete or create anything, and it never touches a
call that already failed — a genuine tool error stays exactly as the tool
reported it.

Every case it cannot decide is **passed through and counted**, never guessed at:

- a result carrying no `path`/`after` pair this plugin can test;
- a binary, oversized or unreadable file;
- a path the backend refuses to resolve or inspect.

The filesystem is the only witness this plugin has, and a witness that cannot be
read is not evidence. The counters are exposed on `ctx.writeReadbackGuard`:

```js
ctx.get('writeReadbackGuard').snapshot()
// { counters: { passed, caught, unprovable, unreadableResult, alreadyFailed, wouldCatch },
//   changes: [...] }
```

## The boundary

**This catches one tool's own false report at that call; it is not a filesystem
guarantee, and a second reader of the file can disagree with a disk that moved
underneath it.** It cannot see a write that lands and is later reverted, it
cannot see a file changed by another process after the read-back, and it says
nothing about tools that report through some other shape.

## Configuration

```yaml
- insert:
    - id: write-readback-guard
      name: '@argszero/dsh-write-readback-guard'
      config:
        mode: verify          # verify | observe | off
        tools: [write, edit]  # whose successful results are tested
        maxBytes: 1048576     # larger files are passed through and counted
        normalizeLineEndings: true
        report: true
```

`observe` changes no result and only counts what `verify` would have caught,
which is the way to measure a deployment before enforcing on it.

## Versions

The plugin declares `@deepseek-ai/dsh-tools >=0.2.1-rc.2 <0.3.0`. The reports
this answers were filed from sessions running `0.2.1-rc.2` and `0.2.1-rc.3`; the
current npm `latest` is `0.2.1-rc.5`, and the seam the plugin uses is identical
on both — `tools/post-execute` may replace the content of a successful result
and may turn it into an error, while only replacing the *value* of a **failed**
result is refused. A successful-but-lying result is that permitted case.

The durable fix belongs to the tools themselves: they could re-read before
answering. This plugin is what a deployment can add without waiting for that.

## Requirements

- `tools` and `fs` services (both are injected; the mount stays pending without
  them, because without a filesystem there is nothing to read back).
- Zero runtime dependencies.

## Test

```sh
npm test
```

The suite drives the **real** `@deepseek-ai/dsh-tool-fs` `write`/`edit` tools
through the **real** `@deepseek-ai/dsh-tools` dispatch pipeline over an
in-memory filesystem that can be told to keep nothing, and pins four arms: the
control (the lie reaches the model), the treatment (it becomes a stated
failure), fail-open (an unreadable witness changes nothing), and must-not-fix (a
genuine error is untouched, and a healthy write is byte-identical).

## License

MIT

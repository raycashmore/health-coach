# Local retrieval preparation experiment

The experiment brief and decisions live in Linear RAY-238. This command tests
local preparation only; it does not publish, embed or search documents.

```sh
pnpm retrieval:prepare /absolute/path/to/synthetic-notes note.md folder/other.md
```

Each run supplies the **complete desired selection**. Omitted documents disappear
from the active snapshot. Pass `ROOT --empty` to remove the final document. Output is private, ignored
`private-data/retrieval/prepared.json`, including source paths and source text.
Do not copy this file into a tracked document or attach it to an issue. Logs show
counts only. A failed read leaves the prior snapshot intact. Use one publisher
process at a time; concurrent runs are unsupported.

The snapshot contains opaque document IDs, content revisions, section IDs,
heading paths, inclusive source line ranges and unverified-wiki provenance.
Unchanged documents retain IDs and revisions. A unique unchanged-content rename
retains identity; ambiguous renames become deletion/addition. Changed text gets a
new revision and new citation IDs. A revision hashes content plus preparation version and budget, so changing chunk
boundaries also invalidates citations. The separate content hash tracks source
changes; neither hash is a medical date. Frontmatter is preserved verbatim, without interpreting its fields.

Preparation uses a 4,000-byte bound, not a provider-specific token estimate.
Ordinary long sections subdivide at line boundaries, which can separate a claim
from qualifications. Inspect retrieval context before relying on the chunks.
Tables and fenced blocks remain atomic to preserve headers, units and syntax.
Oversized blocks are retained with a warning and block indexing. This deliberately
stops short of the brief's proposed table subdivision: a later step must repeat
headers with accurate source mappings before those tables can be indexed.
Unresolved links are flagged; their targets and attachments are not ingested.
Only ATX headings and pipe tables are recognized; other Markdown remains raw
text. This is a bounded experiment parser, not a full Markdown implementation.

This manifest is local preparation state, **not** a successful cloud publication
record. Cloud publication must separately provide authenticated owner isolation,
atomic activation, revision validation and deletion of cached/embedded evidence.
It must refuse a snapshot whose `readyForIndexing` flag is false.

Run the synthetic behavior checks with:

```sh
node --test scripts/retrieval-preparation.test.mjs
```

They exercise no-op, edit, rename, deletion, source reconstruction, tables, fences,
oversized evidence and path isolation. These checks do not measure retrieval
quality or establish hosted latency. Next: settle the corpus, provider, spending
limit and destination, then compare keyword, exact vector and hybrid retrieval on
the same judged questions, timing each stage separately.

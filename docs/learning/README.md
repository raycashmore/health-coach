# Learning companion

Open [index.html](index.html) directly in a browser. It is self-contained, searchable, keyboard accessible and responsive. Keep it beside the repository Markdown files for the original-record links to work.

## Maintenance trigger

Before closing a build slice, update this companion when the work produces an
experiment result, a reusable engineering or AI lesson, a concept explanation
useful for review, or evidence that changes an existing conclusion. Include
negative and inconclusive results. Routine changes with no new learning need
no entry.

Consolidate the learning into the relevant experiment and concept entries,
cross-link them, and record changed understanding in the dated learning log.
Keep the balance between concepts and findings. Use plain language, source
links and explicit limitations; distinguish designs, offline checks, live
results and unverified usefulness. Preserve historical results when recording
corrections. Keep planning and acceptance in their canonical tracker records.

Complete the update steps below in the same slice, including regenerating the
HTML. In the closeout, link the companion when it changed.

## Update

1. Record the experiment in its canonical research document and tracker first.
2. Edit `content.json`: add or refine experiment and concept entries, keeping IDs stable. Include the observed result, limitations, source filename and related concepts. Update `updated`.
3. Update the dated learning log in `scripts/learning/build.mjs` when a conclusion changes. Preserve negative results and distinguish post-run fixes from observed outcomes.
4. From the repository root, run `node scripts/learning/build.mjs`.
5. Open `index.html`; check navigation, search, source links and a narrow viewport.

The builder validates duplicate IDs and concept references. The generated HTML embeds all reading content and JavaScript and makes no network requests. Search is local; no reading history is collected. No paid experiment is run by the builder.

Use repo-safe learning and invented examples only. Linear owns planning and acceptance. This companion is a dated explanation of recorded evidence, not a second tracker or a source of clinical advice.

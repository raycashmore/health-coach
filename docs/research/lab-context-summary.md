# What we did, in plain English

**We built a small working experiment for combining lab results, activity and
notes into one answer. It is not connected to your real records or phone app yet.**

The question guiding the work was:

> What do my latest lab results mean alongside my recent activity and notes?

## How it works

Think of someone collecting the right papers before answering your question:

1. **Collect the numbers.** Take the selected lab results and recent activity,
   keeping their dates and showing missing activity days.
2. **Find relevant notes.** Search the words in Markdown notes. We use Postgres
   full-text search: word-based search, with no vector search yet. Vector search
   would also try to find passages with similar meanings.
3. **Write an explanation.** Give that small collection of evidence to GPT-6.1
   Terra. Ask it to explain what the records show and include references. We can
   swap the model later.
4. **Record how the process behaved.** Langfuse records the steps, timings,
   amount of model usage, estimated cost and simple test scores. The actual
   questions, answers and health evidence stay out of those traces.

Your Markdown files remain where you write notes. We built and tested a way to
publish a searchable copy and update or remove it when the originals change.
**We have not uploaded your wiki or moved your genetics.**

## What we tested

First, we used **six invented examples and a fake model**. These checked missing
activity, undated or conflicting notes, corrections and deletions.

Then, with your approval, we made **one real Terra call using invented evidence**.
It returned an answer, and we checked that Langfuse received the expected steps
and scores. The estimated model cost was **about US$0.0031**, within your **US$5
limit**. Our budget record keeps $0.10 reserved as a conservative allowance; that
is not the estimated bill.

The scores checked whether the expected note was found and references were
valid. They did not prove medical accuracy or usefulness.

## What went wrong

The tracing software unexpectedly included the location of software on the
computer. We replaced that identifying information with a generic name, deleted
the original trace and scores, and sent the corrected metadata again. We
confirmed deletion. **No second model call was needed.**

The retrospective led to automatic checks of the complete outgoing trace,
database checks in CI—the repository's automatic checks—and a reusable command
for inspecting received traces. The changes are committed locally, not deployed.

## What comes next

We have shown that the parts connect. We still need an approved example using
your selected records, followed by your judgement of whether the answer helps.
The phone app also needs connecting to this path.

After establishing that word-search baseline, we can add vector search and run
the same examples again to measure whether it improves the evidence and answers.

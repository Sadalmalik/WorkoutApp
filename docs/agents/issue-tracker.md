# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Closing issues and tickets (no native "close")

This tracker is plain files, so there is no native issue to "close" and no PR-to-issue linkage. Whenever a skill says to close, resolve, or mark an issue/ticket done, express it as an edit to the file's `Status:` line instead:

- **A ticket is done** → set `Status: done` in its `.scratch/<feature-slug>/issues/<NN>-<slug>.md`. Do not delete the file.
- **A spec is fully implemented** → set `Status: done` in `.scratch/<feature-slug>/spec.md` (add the line near the top if it isn't there).
- **`wontfix` / rejected** → set `Status: wontfix`; keep the file for the record.

Specifically for `/implement-spec`: it opens a single branch and draft PR for the whole spec, then runs one implementer per frontier ticket. It has no GitHub issue to auto-close, so after a ticket's work is merged to the PR branch, the merger step sets `Status: done` in that ticket's file. Recompute the frontier from the files (`Status: done` on every blocker) and continue. When all tickets are `done`, set the spec's `Status: done` too. The PR body may reference the ticket file paths, but closing is always the `Status:` edit, never a PR keyword.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

# R4d — kb cleanup proposal

**Status:** proposal, awaiting review before execution.
**Author:** Claude (R4d research step)
**Last updated:** 2026-04-15
**Scope:** `kb/framework/plans/documents-package.md`, `kb/framework/reference/documents-package-design.md`, `kb/framework/reference/documents-legacy-references.md`.

R4d is the knowledge-base cleanup phase of the phase-1.6 restructure. Per the plan (`restructure-2026-04.md` §5 R4d), this document is the proposal step. No kb edits land until you (the user) confirm or edit the actions below.

This document is itself under `press/docs/design/` because R4b already moved the restructure plan there — keeping the R4d proposal next to it makes the before/after easier to review.

## Context

Three kb files describe Press's pre-1.6 world:

| File | Lines | Type | State |
|---|---|---|---|
| `kb/framework/plans/documents-package.md` | 576 | phase-1 plan | Superseded in parts; still authoritative for the "why" |
| `kb/framework/reference/documents-package-design.md` | 48 | condensed design ref | Superseded by `press/docs/concepts.md` + the restructure plan |
| `kb/framework/reference/documents-legacy-references.md` | 49 | legacy code pointers | Still authoritative verbatim; needs filename update |

All three were written before the package was renamed from `@uniweb/documents` to `@uniweb/press` in commit `83343e7`. All three use "documents" in their filename and inside the content.

**Live inbound references** (grepped across the workspace):

- `framework/press/CLAUDE.md` references `documents-legacy-references.md` from two places (the data-attribute vocabulary mention in §Status, and the Cross-references list at the bottom).
- No other live references anywhere in `framework/`, `apps/`, or `platform/`.
- Inside `kb/framework/plans/documents-package.md` itself: no self-references.
- Frozen/historical references under `press/docs/design/historical/` and the restructure plan don't count — those are preserved verbatim and the plan *describes* R4d, it doesn't link to the kb files as live pointers.

One external consumer (press CLAUDE.md) needs a one-line update if we rename. Everything else is clear.

## Per-file proposal

### 1. `kb/framework/reference/documents-legacy-references.md` — rename in place

**Current content.** 49 lines. A list of legacy code pointers: `@uniwebcms/report-sdk/src/utils.js` line numbers, `unirepo/js/frontend/plain/DocumentGenerator/` generators, legacy Block class, production foundations at `report-modules/` and `innovation-modules/`, and the downloader flow. All of it is reverse-engineering material that R5 (legacy parity audit) will use as its ground truth.

**Status.** Still authoritative. The content is frozen-in-time as of 2026-04-09 (stated at the top of the file) and the line numbers may drift, but the structure — which files contain which legacy patterns — is exactly what R5 needs. Replacing or consolidating this file would lose useful information.

**Proposal:** **Rename** `documents-legacy-references.md` → `press-legacy-references.md`. Update:

- Frontmatter `description` to say "the `@uniweb/press` design" instead of "the `@uniweb/documents` design" (one string change).
- The one mention of "`@uniweb/documents`" in the body (line 7) to "`@uniweb/press`".

Do **not** otherwise touch the file. The legacy line numbers and path conventions stay as-is.

**Cross-repo update:** `framework/press/CLAUDE.md` has two inbound references. Update both to the new filename as part of the same commit.

---

### 2. `kb/framework/reference/documents-package-design.md` — delete and redirect

**Current content.** 48 lines. A condensed project memory describing the "Why / How to apply" of the original `@uniweb/documents` design. Covers: heterogeneous registration, the three patterns (docx / xlsx / pdf), the data-attribute vocabulary, the builder component layer, lazy-loaded adapters, @citestyle-over-citation-js, EntityStore instead of a new fetch primitive, aggregation in plain JS, key open decisions (HTML walker vs react-reconciler, multi-page orchestrator, default = single page), and the v1 out-of-scope list.

**Status.** Every point in this file is now better-covered by one of the post-restructure docs:

| This file | Now documented in |
|---|---|
| The three patterns (docx/xlsx/pdf) | `press/docs/concepts.md` "Three output shapes, one registration interface" |
| Registration via hook, not mutation | `press/docs/concepts.md` "The registration pattern" |
| Data-attribute vocabulary | `press/docs/api/docx.md` + link to `src/ir/attributes.js` |
| Builder component layer | `press/docs/api/docx.md` |
| Lazy-loaded adapters | `press/docs/concepts.md` "Lazy-loaded adapters" |
| Citations = foundation concern | `press/docs/guides/citations.md` |
| EntityStore, not a new fetch primitive | (out of scope for Press; covered where it belongs in framework/core) |
| Aggregation in plain JS | (implicit — Press has no template engine, nothing to say) |
| HTML walker vs react-reconciler | `restructure-2026-04.md` (frozen historical) — not currently a live question |
| Multi-page orchestrator | Out of scope for phase 1.6 (the plan's §8) |

The v1 out-of-scope list is frozen historical — the restructure doc has its own phase-1.6 out-of-scope list in §8.

There is **nothing** in this file that is both live and not already said better elsewhere.

**Proposal:** **Delete** `documents-package-design.md`. Replace with a tiny stub file named `press-package-design.md` at the same path whose body is a single pointer:

```md
---
name: "@uniweb/press design (redirect)"
description: Historical placeholder. The live design doc has moved.
type: reference
---

The `@uniweb/press` design is now maintained in the package itself:

- **Architecture overview for readers:** `framework/press/docs/concepts.md`
- **Full phase-1.6 restructure plan:** `framework/press/docs/design/restructure-2026-04.md`
- **Eight-round review trail for the restructure:** `framework/press/docs/design/restructure-2026-04-revision-history.md`
- **Pre-restructure phase-1 design (frozen):** `framework/press/docs/design/historical/original-press-package-design.md`

The prior kb doc at this location has been removed because its content
was entirely superseded by the files above.
```

This gives a reader who stumbles on the old kb path a clear onward pointer. Alternative: delete the file entirely with no replacement. I lean toward the stub because it's one file and takes ten seconds to write, and the value-to-cost ratio of leaving a breadcrumb is very high.

---

### 3. `kb/framework/plans/documents-package.md` — archive + stub

**Current content.** 576 lines. The original phase-1 plan. Structure:

- Overview (the use case, why now, why a new package)
- Architecture: heterogeneous registration (three patterns, the preview-output sync story, the registration model)
- Component-side API
- Package structure (phase-1 layout, now obsolete)
- Data attribute vocabulary
- Builder components
- Format adapters (docx, xlsx, pdf)
- Multi-page and multi-sheet assembly
- Integration with modern Uniweb (EntityStore, citations, Block class)
- What's out of scope for v1
- Decisions made (and why)
- Open questions (mostly resolved in phase 1, a handful open for phase 2+)
- Implementation plan (phases 1-5)
- References (legacy code + modern Uniweb code + external libraries + auto-memory + glossary)

**Status.** Half historical, half superseded:

- **Superseded by `press/docs/concepts.md` and `press/docs/design/restructure-2026-04.md`:** the architecture explanation, the registration model, the three patterns, the data-attribute vocabulary rationale, the builder-component layer rationale, the lazy-loading decision, the no-TypeScript decision, the no-build-step decision. All of it is now documented in the package itself, in more depth, with the phase-1.6 context.
- **Phase-1 implementation notes** (what was built, tests passing, decisions made during implementation): these are frozen historical. They describe what phase 1 looked like, which is now two phases ago. No longer actionable.
- **Phase 4-5 plan** (real-world port, university delivery): these are still alive — R5 of the restructure plan is the spiritual successor of "phase 4 (real-world port)". But the R5 plan lives in `restructure-2026-04.md` §5 R5 and is the authoritative version.
- **Open questions list:** mixed. The resolved ones (package location, first deliverable, priority format, stack, docx@^9, header/footer, DownloadButton) are frozen historical. The still-open ones (xlsx library choice, builder component `format` modes, the `##` operator mystery, PDF path, react-reconciler) remain live, but most are deferred to phases beyond R5.
- **References section:** duplicates most of `documents-legacy-references.md` plus adds "modern Uniweb code to integrate with" and an external-libraries list. The legacy pointers are the same content as file #1; the modern-Uniweb integration section is still correct.

**Proposal:** **Archive** the file into `press/docs/design/historical/` alongside the existing `original-press-package-design.md`. Specifically:

1. Copy `kb/framework/plans/documents-package.md` to `framework/press/docs/design/historical/original-press-package-plan.md`. No content changes — it's a historical snapshot.
2. Delete the original at `kb/framework/plans/documents-package.md`.
3. Leave a short stub at `kb/framework/plans/press-package.md` pointing at the new home and at the current phase-1.6 plan:

    ```md
    ---
    name: "@uniweb/press plan (redirect)"
    description: Historical placeholder. The live Press plan is in the package repo.
    type: project
    ---

    The `@uniweb/press` phase-1.6 plan (current) lives at:

    - `framework/press/docs/design/restructure-2026-04.md`

    The original phase-1 plan (historical, preserved for reference) lives at:

    - `framework/press/docs/design/historical/original-press-package-plan.md`

    The prior kb doc at this location has been moved because the authoritative
    plan now lives inside the package itself, next to the code it describes.
    ```

**Rationale for archiving rather than consolidating.** The phase-1 plan is 576 lines. A line-by-line merge into the restructure plan would double the restructure plan's size and confuse "what did we decide in phase 1" with "what did we decide in phase 1.6". Keeping them as two separate historical snapshots — one for phase 1, one for phase 1.6 — gives future readers a clear timeline without forcing anyone to untangle merge commits.

The archive lives next to `original-press-package-design.md` which is already the phase-1 *design* doc. Calling the plan `original-press-package-plan.md` gives it a parallel filename.

---

## Summary table

| File | Action | New location | Inbound updates |
|---|---|---|---|
| `kb/framework/reference/documents-legacy-references.md` | Rename + two-string edit | `kb/framework/reference/press-legacy-references.md` | `press/CLAUDE.md` (2 refs) |
| `kb/framework/reference/documents-package-design.md` | Delete, leave redirect stub | `kb/framework/reference/press-package-design.md` (stub) | none |
| `kb/framework/plans/documents-package.md` | Archive, leave redirect stub | `press/docs/design/historical/original-press-package-plan.md` + `kb/framework/plans/press-package.md` (stub) | none |

Total net change: one 49-line rename, one 48-line delete + 15-line stub, one 576-line move-to-archive + 15-line stub, plus the two-line edit in `press/CLAUDE.md`.

## Open questions for the reviewer

1. **Redirect stubs vs. hard deletes.** I proposed short stubs at the old paths so readers who guess "the kb probably has a `documents-*` or `press-*` file for this" get a pointer instead of a 404. Alternative: delete outright, on the theory that stale stubs are still stale. My preference is stubs. Tell me otherwise.

2. **`.inbox/press-package.md`.** The grep turned up a file at `framework/press/.inbox/press-package.md`. `.inbox/` is the user's drop zone, gitignored, not in R4d's scope — but mentioning it here in case it's something you want to fold into the cleanup now rather than later.

3. **Auto-memory entries.** The "Auto-memory" subsection of `documents-package.md` (line 563) notes that Claude-private per-user auto-memory notes may mirror the kb content. R4d is about the committed kb — the auto-memory is orthogonal and not something this proposal can touch. If you want me to review the auto-memory store for stale `@uniweb/documents` references, tell me and I'll do it as a separate step.

4. **Re-scan after the first execution.** Once this proposal is executed, there will still be mentions of "`documents-package.md`" and friends inside `press/docs/design/restructure-2026-04.md` and the revision history — those are frozen historical documents and I've been treating them as read-only. Confirm that's the right call, or tell me to update the frozen docs to point at the new paths.

## Execution order once approved

If you approve this as-is:

1. Copy `kb/framework/plans/documents-package.md` → `framework/press/docs/design/historical/original-press-package-plan.md`. Verbatim copy, no content edits.
2. Delete `kb/framework/plans/documents-package.md`.
3. Create `kb/framework/plans/press-package.md` with the redirect stub.
4. Rename `kb/framework/reference/documents-legacy-references.md` → `kb/framework/reference/press-legacy-references.md` with the two-string edit (frontmatter description + body line 7).
5. Delete `kb/framework/reference/documents-package-design.md`.
6. Create `kb/framework/reference/press-package-design.md` with the redirect stub.
7. Update `framework/press/CLAUDE.md`: replace both references to `documents-legacy-references.md` with `press-legacy-references.md`.
8. Commit steps 1-6 together (kb side), commit step 7 separately in the Press repo. Two commits in two different repos.

Run these only after explicit approval.

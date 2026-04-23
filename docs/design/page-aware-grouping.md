# Page-aware grouping for the 'html' input shape — design

**Status:** proposal, not yet implemented. First written 2026-04-23; revised the same day after an ergonomics review surfaced a cleaner approach.
**Scope:** give HTML-string adapters (EPUB today, future slides / multi-file web export) an optional grouping signal, so a foundation can say "these N registrations belong to the same chapter" without Press learning what a `Page` is.
**Related:** `./epub-adapter.md` ("Chapter boundaries" section), `../architecture/principles.md` principles 1, 4, 7, `../architecture/overview.md` (registration model).

## The problem the EPUB adapter exposed

The EPUB adapter that shipped on 2026-04-23 emits one `.xhtml` chapter per registered body fragment. That's a principled v1 — the `'html'` input shape has no grouping information — but it diverges from the EPUB design doc:

> **One XHTML per `Page`.** Uniweb's Page is the natural structural unit — a "chapter" in the content graph already. The EPUB spine follows Page order; the nav doc groups by Page title.
>
> **If a Page has multiple H1-level headings**, keep them in one XHTML.

The shipped behaviour collapses to that only when foundations happen to register one fragment per page. The typical foundation registers one fragment per *block* (matching `useDocumentOutput(block, 'html', …)` semantics), so a page with three blocks currently becomes three chapters in the EPUB. For most books this is either fine (if blocks roughly correspond to chapters) or wrong (if the author wrote a page with heading + body + aside).

Paged.js isn't affected because its adapter joins all `sections` into one paginated body. A future slide adapter or multi-file HTML export would have the same question EPUB has.

## What this does NOT do

- **Does not introduce a Uniweb dependency into Press.** The grouping signal is an opaque value the caller supplies. Press never looks up anything on a `Page` object or a `Block` object.
- **Does not break Paged.js.** Paged.js ignores grouping; its adapter reads `sections` as a flat list and always will.
- **Does not break the current EPUB behaviour for callers that don't opt in.** Absent a grouping signal, each fragment remains its own chapter (current v1 default).
- **Is not a new input shape.** Adding a sibling input key `'epub'` or `'grouped-html'` would mean foundations write two registrations for EPUB + Paged.js, which is exactly the waste the current `consumes: 'html'` aliasing avoids.

## The revised proposal: compile-time `groupBy`, not registration-time `group`

The earlier draft of this doc proposed putting a `group: { id, title?, order? }` field on every `useDocumentOutput` registration. That had two problems the revision fixes:

1. **Per-section-type boilerplate.** Every section component that calls `useDocumentOutput` would have to construct the same `group` object from `block.page`. With 20+ section types per foundation, that's ~100 lines of identical code that also has to change whenever the grouping strategy does. The section component is the wrong place to hold a compile-wide decision.
2. **Disagreement between sibling registrations.** Two section types that register from the same block (rare but possible — e.g., a body section plus a footnote registration) would both emit `group` and could disagree on `title` or `order`. The draft had no resolution rule.

**Revised shape:** grouping is a *compile-time* concern, not a registration-time concern. The caller passes a `groupBy` function to the compile call; Press looks up each registration's block (already in the store), passes it through the function, and uses the returned descriptor to group fragments.

```js
// DownloadButton in a book foundation — one place, not every section type:
const blob = await compileSubtree(
    <ChildBlocks blocks={blocks} />,
    'epub',
    {
        basePath: website?.basePath,
        adapterOptions: { meta },
        groupBy: (block) =>
            block?.page
                ? {
                      id: block.page.route,
                      title: block.page.title,
                      order: block.page.order,
                  }
                : undefined,
    },
)
```

Existing registrations are untouched. A foundation's section types call `useDocumentOutput(block, 'html', <Chapter block={block} />)` exactly as they do today. The grouping decision lives in the download flow, which is where foundation-level compile concerns already live (Typst preamble, Paged.js stylesheet, metadata assembly — same layer).

### Why this is strictly better than registration-time `group`

| | Registration-time `group` | Compile-time `groupBy` |
|---|---|---|
| Where the rule lives | In every section type that emits a fragment | In the DownloadButton (one place) |
| Lines of foundation code | ~5 × N section types | ~7 lines total |
| Disagreement between sibling registrations | Possible; no resolution rule | Impossible by construction — one function, one answer per block |
| Same content, multiple compiles with different groupings | Needs a conditional in every `useDocumentOutput` call | Pass a different `groupBy` to each compile |
| Non-Uniweb caller | Must invent group objects at every registration | Omits `groupBy`; fragments stay ungrouped |
| Registration surface change | `useDocumentOutput` gains a new options field | Zero change |
| Paged.js impact | None (it ignores the field) | None (it ignores the option) |

The revised approach dominates on every axis that mattered in the first draft, and adds one axis the first draft couldn't serve at all (per-compile grouping strategies).

### Principle check

- **Principle 1 (registration is the only mandatory contract).** Stronger than the first draft: registration doesn't change *at all*. Foundations that never call `groupBy` see zero surface change. The new option sits on the *compile* primitive, not the registration one.
- **Principle 4 (abstraction level is per-format).** Paged.js ignores `groupBy`; EPUB uses it; xlsx / docx / typst are unaffected (different input shapes). Adding a slide adapter later that needs different grouping semantics can either reuse this one or introduce its own.
- **Principle 6 ("extract shared logic when a second adapter needs it", with the "already earned" carve-out).** The shape of the grouping descriptor is determined by the EPUB design doc's explicit requirements (an id to group by, a title for nav, an order for spine placement), not by speculation about the second consumer. Per the already-earned carve-out in principles.md, generalising now — when the API's shape is fully determined by one existing consumer plus existing contracts — is not premature.
- **Principle 7 (semantic input stays upstream).** Press takes an opaque function and calls it with whatever `block` the foundation registered under. Press does not know what a `Page`, route, or block graph is. A non-Uniweb caller produces HTML fragments with whatever keys it has and supplies a `groupBy` that inspects those keys (or omits it). Same ergonomics, no Uniweb coupling.

## How the compile pipeline changes

`src/ir/compile.js` currently produces `{ sections: string[], metadata }` for `consumes: 'html'`. The extension is additive:

```
{
  sections: string[],          // flat, unchanged — one entry per body fragment
  groups:   Array<{
    id: string,
    title?: string,
    order?: number,
    sectionIndices: number[],  // indices into `sections` — preserves the flat order
  }> | null,
  metadata: Object | null
}
```

`groups` is `null` when no `groupBy` was supplied (Paged.js path, current EPUB default). When supplied, the pipeline:

1. Walks registrations in insertion order (unchanged).
2. For each registration, renders the fragment to HTML and pushes it onto `sections` (unchanged).
3. Calls `groupBy(block)` on the registration's block. If the return value has an `id`, append the section's index to the group's `sectionIndices` array (creating the group on first encounter, carrying `title` and `order` from the first non-null return).
4. After the walk, sort groups by `order` (stable — ties preserve first-appearance order) and emit the groups array.

Ungrouped registrations (where `groupBy` returned `undefined` or `null`) stay in `sections` but aren't part of any group; adapters can treat them as their own single-fragment chapters or ignore them — EPUB's behaviour is documented below.

### Why a sidecar `groups[]` with indices, not nested `sections[][]`

Three reasons:

1. Paged.js's `sections.join('\n')` call still works without a single-line change. Nesting the array would force Paged.js to flatten.
2. The flat-with-indices shape matches how authorship order and grouping interact elsewhere in Uniweb (`pages:`, `sections:` wildcards) — one authoritative order, grouping layered on top.
3. Ungrouped fragments stay first-class. A foundation that supplies `groupBy` but registers a whole-book TOC as a blockless fragment (where `block` is `{}`) gets `groupBy({}) → undefined` and the TOC appears ungrouped, before or after groups in registration order. No special case.

## How the EPUB adapter changes

Small, localized. The current chapter builder is:

```js
const chapters = sections.map((html, i) => buildChapter(html, i))
```

The grouped version picks a path based on `input.groups`:

- **No groups** (today's default): unchanged. Each fragment is one chapter.
- **With groups**: for each group, concatenate the group's fragments (joined by `sectionIndices` order) into one HTML string, parse it, build one chapter. `group.title` is the chapter title (falling back to first-heading extraction). `group.order` controls spine position. Ungrouped fragments each become their own chapter, interleaved by registration order.

Estimated diff:

- `src/ir/compile.js` — ~25 lines: carry `block` into the HTML-passthrough branch, apply `groupBy`, build the `groups` sidecar. IR branch and xlsx passthrough untouched.
- `src/useDocumentCompile.js` + `src/compileSubtree.js` (or wherever the compile entry points live) — ~5 lines: forward `groupBy` into `compileOutputs`. No behavioural change when absent.
- `src/adapters/epub.js` — ~30 lines: a `groupChapters(sections, groups)` helper that returns the same `chapterManifest` shape the rest of the adapter already consumes. Nothing else in epub.js moves.
- `tests/epub/adapter.test.js` — new describe block: "grouped sections become one chapter per group," with cases for spine ordering via `group.order`, title fallback, mixed grouped/ungrouped registrations.
- `tests/integration/epub-pipeline.test.jsx` — extend with a grouped scenario so the full pipeline is exercised end-to-end.

## Foundation wiring

One change per book foundation: the DownloadButton gains a `groupBy` argument on its EPUB compile call.

```js
// Before (v1 EPUB, one chapter per block):
const blob = await compileSubtree(
    <ChildBlocks blocks={blocks} />,
    'epub',
    { basePath, adapterOptions: { meta } },
)

// After (one chapter per page):
const blob = await compileSubtree(
    <ChildBlocks blocks={blocks} />,
    'epub',
    {
        basePath,
        adapterOptions: { meta },
        groupBy: (block) =>
            block?.page
                ? {
                      id: block.page.route,
                      title: block.page.title,
                      order: block.page.order,
                  }
                : undefined,
    },
)
```

Section components change nothing. That's the whole point.

## Downsides and risks (honest accounting)

1. **"`groupBy` returns an object" is a slightly awkward API compared to `groupBy` returning a string id.** Returning `string | undefined` would be simpler, but then there's no place to put `title` and `order`. The current book foundations want both. A separate `getGroupMeta(id) → { title, order }` API is worse (two functions, same domain). The object return wins.

2. **Ungrouped-alongside-grouped interleaving rule needs a test and a docstring.** The proposal commits to "interleaved by registration order." That's defensible — it matches how Uniweb's `pages:` and `sections:` wildcards work elsewhere — but mixed modes are where API designs drift. Add an integration test that exercises [grouped, ungrouped, grouped, grouped, ungrouped] registration order and asserts the output matches that order with groups collapsed.

3. **If a future adapter wants different grouping semantics** (e.g., slides grouped by "deck" where one deck spans multiple registrations including metadata-only entries), the current `groupBy(block) → descriptor` shape may be too narrow. Acceptable — principles 4 and 5 explicitly allow new adapters to introduce new shapes rather than bending an existing one. The EPUB shape doesn't have to serve slides.

4. **`groupBy` runs for every registration, potentially many times per compile.** Foundations are expected to make it a pure, cheap function. Document this explicitly. (In practice the grouping object can be memoised by the caller if `block.page` is stable, which it is.)

5. **Disagreements between registrations still need a rule, just a different one.** Two fragments with the same `id` but different `title` or `order`: the pipeline uses the *first non-null* value it sees, to match "first registration wins" semantics used elsewhere. Document and test.

6. **`groupBy` doesn't let a caller *split* one block's registrations into multiple groups.** That's intentional — if the same block registers twice with different group intent, the caller can't express both via `groupBy(block)` alone. Real-world foundations don't hit this (blocks register once), but the limitation is real. If it ever matters, the fix is to pass the registration's options object into `groupBy(block, options)` as a second arg — additive, non-breaking.

7. **Not every `block` coming into `groupBy` is a real `Block` instance.** Some registrations use a sentinel object as the block key (anything with object identity). `groupBy` must gracefully handle those — in practice `block?.page ?? undefined` is the right pattern and the proposal's example uses it. Document in the `groupBy` JSDoc.

## Alternatives (re-examined after the revision)

**1. A new `'epub'` input shape that carries structured chapters.**
Rejected for the same reason as before — it splits registrations across two keys. The revision doesn't change this calculus.

**2. Extract page boundaries from the rendered HTML via a sentinel attribute.**
Still rejected. The HTML-sentinel approach pollutes Paged.js's markup with attributes it has no use for, and it re-derives information the foundation already has. `groupBy` is strictly cleaner.

**3. Require exactly one registration per page.**
Still rejected — forces foundations to pre-assemble per-page fragments, losing the block-level granularity that matches `useDocumentOutput(block, …)` semantics.

**4. Infer groupings from `<h1>` boundaries.**
Still rejected — breaks the moment a page has multiple H1s or none.

**5. (Revised-draft-specific) A `<PageGroup>` wrapper component that emits a sentinel fragment.**
Considered and rejected in this revision. The wrapper would have to register a "group-start" marker that Paged.js would have to filter out, polluting the shared input shape. Also pushes the grouping decision back into the render tree, where it doesn't belong.

**6. (Revised-draft-specific) Expose `block` in the adapter input shape and let each adapter do its own grouping.**
That is, emit `{ sections: [{html, block}], metadata }` and let EPUB choose how to group. Maximally flexible, but pushes policy into every adapter and couples each adapter's code to whatever the caller calls a block. `groupBy` at the pipeline level centralises the policy once.

## Open questions (decide during implementation)

1. **Group-level metadata for the nav doc.** Currently the nav doc lists chapter titles. With groups, should the nav list group titles *and* intra-group headings (two-level TOC), or just group titles (flat TOC)? Lean toward flat in v1 — matches `epub-adapter.md`'s "flat per-page nav in v1" explicit scope. Revisit if real books demand nested nav.
2. **Ties in `group.order`.** Stable sort — preserve registration order of first appearance. Document and test.
3. **`groupBy` returning a different object shape per block (partial vs. complete descriptors).** A pragmatic "first non-null title wins, first non-null order wins" rule keeps the pipeline permissive. Test with mixed-quality returns.
4. **Does `compileSubtree` forward `groupBy` inside `DocumentProvider`'s own wrap path?** No — grouping is applied after registration, during `compileOutputs`. `DocumentProvider` doesn't need to know about it.

## File additions / changes (expected)

```
src/
├── ir/compile.js                (MODIFY — carry block through, apply groupBy, emit groups)
├── compileSubtree.js            (MODIFY — forward groupBy option)
├── useDocumentCompile.js        (MODIFY — accept groupBy in documentOptions or a sibling key)
└── adapters/epub.js             (MODIFY — groupChapters(sections, groups))

tests/
├── core/
│   └── grouped-compile.test.jsx         (NEW — pipeline produces correct groups array)
├── epub/
│   └── adapter.test.js          (EXTEND — grouped-chapter describe block)
└── integration/
    └── epub-pipeline.test.jsx   (EXTEND — grouped scenario + interleaving)

projects/foundations/book-web/src/components/DownloadButton.jsx   (MODIFY — add groupBy to EPUB call)
projects/foundations/press-book/src/components/DownloadButton.jsx (MODIFY — add groupBy to EPUB call)
```

**No foundation section-component changes.** That's the ergonomic win this revision delivers.

## When this doc should be deleted

When grouped-chapter EPUB ships, tests cover it, and the EPUB adapter doc (`./epub-adapter.md`) has its "One XHTML per Page" section updated to reference the shipped behaviour instead of the design proposal.

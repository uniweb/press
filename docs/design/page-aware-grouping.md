# Page-aware grouping for the 'html' input shape — design

**Status:** proposal, not yet implemented. Written 2026-04-23, on the heels of the EPUB adapter shipping with one-chapter-per-registered-fragment as a v1 compromise.
**Scope:** give HTML-string adapters (EPUB today, future slides / multi-file web export) an optional grouping signal for registrations, so a foundation can say "these N fragments belong to the same chapter" without Press having to know what a `Page` is.
**Related:** `./epub-adapter.md` ("Chapter boundaries" section), `../architecture/principles.md` principles 1, 4, 7, `../architecture/overview.md` (registration model).

## The problem the EPUB adapter exposed

The EPUB adapter that shipped on 2026-04-23 emits one `.xhtml` chapter per registered body fragment. That's a principled v1 — the `'html'` input shape is `{ sections: string[], metadata }` and has no grouping information — but it's not what the EPUB design doc originally described:

> **One XHTML per `Page`.** Uniweb's Page is the natural structural unit — a "chapter" in the content graph already. The EPUB spine follows Page order; the nav doc groups by Page title.
>
> **If a Page has multiple H1-level headings**, keep them in one XHTML.

The shipped behaviour collapses to that only when foundations happen to register one fragment per page. The typical foundation registers one fragment per *block* (matching `useDocumentOutput(block, 'html', …)` semantics), so a page with three blocks currently becomes three chapters in the EPUB. For most books this is either fine (if blocks roughly correspond to chapters) or wrong (if the author wrote a page with heading + body + aside).

Paged.js isn't affected because its adapter joins all `sections` into one paginated body — grouping is irrelevant there. A future slide adapter or multi-file HTML export would have the same question EPUB has.

## What this does NOT do

- **Does not introduce a Uniweb dependency into Press.** The grouping signal is an opaque string the foundation chooses. Press never looks up anything on a `Page` object or a `Block` object. Principle 7 ("semantic input stays upstream") still holds: foundations, which live one layer above Press, own the mapping from `block.page` to a grouping key.
- **Does not break Paged.js.** Paged.js ignores grouping; its adapter reads `sections` as a flat list and always will.
- **Does not break the current EPUB behaviour for foundations that don't opt in.** Fragments without a grouping key each become their own chapter (current v1 default).
- **Is not a new input shape.** Adding a sibling input key `'epub'` or `'grouped-html'` would mean foundations write two registrations for EPUB + Paged.js, which is exactly the waste the current `consumes: 'html'` aliasing avoids. The grouping metadata rides on top of the existing shape.

## The proposed shape

Extend the existing `useDocumentOutput` registration options with an **optional** `group` descriptor. Fragments sharing a `group.id` become one chapter / slide deck / bundled unit. `group.title` provides a human-readable label for the nav.

```js
// Foundation section component — unchanged for the common case:
useDocumentOutput(block, 'html', <Chapter block={block} />)

// Opt-in page-aware grouping:
useDocumentOutput(block, 'html', <Chapter block={block} />, {
    group: {
        id: block.page.route,          // or block.page.id — foundation's call
        title: block.page.title,       // optional; adapter falls back to first heading
        order: block.page.order,       // optional; stable sort key
    },
})
```

Key shape decisions:

- **`group` is an object, not a bare string.** Makes room for `title` and `order` without a second registration. Extracting those from the HTML would be a regression — the foundation already knows them cleanly.
- **`group.id` is opaque to Press.** Equal ids group together; no ordering semantics beyond equality. Any string the foundation likes (page route, UUID, slug) works.
- **`group.order` is optional.** When absent, groups appear in the order their first fragment was registered — matches how `sections` already behaves for ungrouped registrations. When present, groups sort by this value.
- **Inside a group, fragments retain registration order.** Within-page ordering is already solved by registration order; no need for a second sort key per fragment.

## How the compile pipeline changes

`src/ir/compile.js` currently produces `{ sections: string[], metadata }` for `consumes: 'html'`. The extension is additive:

```
{
  sections: string[],            // flat, unchanged — ungrouped fragments + all grouped fragments in order
  groups:   Array<{
    id: string,
    title?: string,
    order?: number,
    sectionIndices: number[],    // indices into `sections` — preserves 1-1 mapping with the flat array
  }> | null,
  metadata: Object | null
}
```

Paged.js reads `sections` and ignores `groups` — no change. EPUB reads `groups` when present, falls back to "each section is its own chapter" when `groups` is null or empty.

**Why a sidecar `groups` array, not nested `sections`?** Three reasons:

1. Paged.js's `sections.join('\n')` call still works without a single-line change. Nesting the array would force Paged.js to flatten.
2. The flat-with-indices shape matches how authorship order and grouping interact elsewhere in Uniweb (`pages:`, `sections:` wildcards) — one authoritative order, grouping layered on top.
3. Ungrouped fragments stay first-class. A foundation that registers some grouped, some ungrouped fragments (mixed mode: whole-book TOC as one fragment + per-page chapters) gets predictable flat order with group metadata on the side.

## How the EPUB adapter changes

Small, localized. The current adapter has:

```js
const chapters = sections.map((html, i) => buildChapter(html, i))
```

The grouped version picks one of two paths based on whether `input.groups` is populated:

- **Grouped path**: for each group, concatenate the group's HTML fragments in order, parse the combined string, run the existing chapter builder. `group.title` becomes the chapter title (falling back to first-heading extraction), `group.order` controls spine position. Ungrouped fragments each become their own chapter, interleaved by registration order.
- **Flat path** (unchanged): today's behaviour. Each fragment is one chapter.

Affected files, expected diff size:

- `src/ir/compile.js` — ~20 lines: carry `group` through from the registration entry, build the `groups` array, preserve flat `sections` ordering. Keep the IR branch and xlsx passthrough untouched.
- `src/adapters/epub.js` — ~30 lines: a `buildChapters(sections, groups)` helper that returns the same `chapterManifest` shape the rest of the adapter already consumes. Nothing else in epub.js moves.
- `src/useDocumentOutput.js` — zero lines of behavioural change. The existing options object already passes through; the only update is doc-comment.
- `tests/epub/adapter.test.js` — new describe block: "grouped sections become one chapter per group". Asserts spine order via `group.order`, title from `group.title`, fallback to first-heading when title is absent, mixed grouped/ungrouped registrations.
- `tests/integration/epub-pipeline.test.jsx` — extend the existing "register → compile" test with a grouped scenario so the full pipeline is covered end-to-end.

## Foundation wiring

Book foundations pick up the grouping signal where they already know the Page boundary — inside the section component that calls `useDocumentOutput`. For the current book-web / press-book foundations:

```js
// Inside a section component, after resolving `block`:
const group = block?.page
    ? {
          id: block.page.route,
          title: block.page.title,
          order: block.page.order,
      }
    : undefined

useDocumentOutput(block, 'html', <Chapter block={block} />, { group })
```

This is a 5-line change per section type. The `group` object is entirely foundation territory — Press never constructs one. If a foundation never sets `group`, behaviour is identical to today.

## Alternatives considered

**1. A new `'epub'` input shape that carries structured chapters.**

Rejected. Foundations would have to register twice (once for Paged.js under `'html'`, once for EPUB under `'epub'`), or re-export Paged.js-ready HTML from an EPUB-specific shape. The whole point of `consumes: 'html'` aliasing is to avoid that. This was resolved explicitly in `epub-adapter.md`'s "Input shape" section — revisiting it in a week would be whiplash.

**2. Extract page boundaries from the rendered HTML via a sentinel attribute.**

The foundation could emit `<section data-page-boundary="intro">…</section>` and the EPUB adapter could split on it. Cheap to implement, but: (a) ties Press to a specific HTML convention foundations must memorise, (b) requires the foundation to wrap every registration in the sentinel — no less work than passing `group` — and (c) pollutes Paged.js's HTML with attributes it has no use for. Worse than just passing a metadata object.

**3. Require exactly one registration per page.**

Would make EPUB "work" without new plumbing, but forces foundations to assemble per-page fragments manually before registering — losing the block-level granularity that matches `useDocumentOutput(block, …)` semantics. Regressive.

**4. Infer groupings by clustering on `<h1>` boundaries.**

Looks elegant, breaks the moment a page has multiple H1s (as the EPUB design doc already flags) or no heading at all (front matter, an index page). Also inverts the relationship: the foundation knows the page structure authoritatively; re-deriving it from rendered HTML is guessing what the foundation already told us.

**5. Leave it as-is and document "register per page" as the EPUB convention.**

The cheapest option. Worth considering if the real-world foundation patterns happen to register per-page already. For the current book foundations (one registration per block, many blocks per page) it isn't the case, so this would mean shipping an EPUB that doesn't match the design doc and hoping nobody notices.

## Principle check

- **Principle 1 (registration is the only mandatory contract)**: satisfied. `group` is an *optional* options field on the existing `useDocumentOutput` hook. Foundations that don't use it see no change.
- **Principle 4 (abstraction level is per-format)**: satisfied. Paged.js ignores the grouping; EPUB uses it; xlsx / docx / typst are unaffected (they consume different input shapes). Adding a slide adapter later that needs different grouping semantics can introduce its own shape or reuse this one — both doors open.
- **Principle 6 (extract shared logic when a second adapter needs it)**: the grouping *signal* is being generalised before a second consumer exists. This is deliberate — the signal's shape is determined by the EPUB design doc's already-stated requirements, not speculation about a hypothetical second adapter. Per the "When the generalization is already earned" carve-out in principles.md, the shape is determined by the existing adapter's needs plus the registration model's existing contract, not by guessing about the next consumer.
- **Principle 7 (semantic input stays upstream)**: satisfied. Press learns nothing about `Page`, `Block`, routes, or Uniweb's object graph. The foundation maps its semantic model to an opaque grouping key. A non-Uniweb consumer producing HTML fragments with a grouping id works identically.

## Open questions (decide during implementation)

1. **Group-level metadata for the nav doc.** Currently the nav doc lists chapter titles. With groups, should the nav list group titles *and* intra-group headings (two-level TOC), or just group titles (flat TOC)? Lean toward flat in v1 — simpler, matches the EPUB design doc's "flat per-page nav in v1" explicit scope — revisit if real books demand nested nav.
2. **`group.order` semantics when two groups have the same number.** Stable sort — preserve registration order of first appearance. Document this, test it.
3. **Mixed grouped + ungrouped registrations.** Should ungrouped fragments appear before, after, or interleaved with grouped ones? Lean toward "interleaved by registration order" — predictable, matches how Uniweb already behaves in `pages:` and `sections:` lists.
4. **Group opt-in through the options vs. through a separate hook.** A new `useDocumentGroup(block, format, id, metadata)` hook is tempting (cleaner separation), but it doubles the hook surface for a minor ergonomic win and forces foundations to call it alongside `useDocumentOutput`. Keep it in the options object.

## File additions / changes (expected)

```
src/
├── ir/compile.js                 (MODIFY — carry group through, emit groups sidecar)
├── useDocumentOutput.js          (MODIFY — doc comment only, no behaviour change)
└── adapters/
    └── epub.js                   (MODIFY — buildChapters(sections, groups))

tests/
├── core/
│   └── grouped-registrations.test.jsx   (NEW — compile pipeline produces correct groups)
├── epub/
│   └── adapter.test.js           (EXTEND — grouped-chapter describe block)
└── integration/
    └── epub-pipeline.test.jsx    (EXTEND — grouped scenario)

projects/foundations/book-web/src/.../<SectionTypes>.jsx    (MODIFY — opt in to group)
projects/foundations/press-book/src/.../<SectionTypes>.jsx  (MODIFY — opt in to group)
```

## When this doc should be deleted

When grouped-chapter EPUB ships, tests cover it, and the EPUB adapter doc (`./epub-adapter.md`) — which still lives in `docs/design/` — has its "One XHTML per Page" section updated to reference the shipped behaviour instead of the design proposal.

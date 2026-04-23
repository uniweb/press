# Paged.js running content — design

**Status:** proposal, ready to implement after review.
**Last updated:** 2026-04-23.
**Scope:** extends the shipped Paged.js adapter (`./pagedjs-adapter.md`) with a book-foundation-level convention for running headers and footers. Independent of the original adapter's deletion plan — ships separately.

---

## Problem

The Paged.js adapter today supports running content only via CSS named strings (`string-set: chapter content()` + `@page @top-* { content: string(chapter); }`) and page counters. The default stylesheet uses this well for the common book case: chapter name in the top outer corner, page number in the bottom outer corner.

Gaps:

- Authors can't customize running content without forking the stylesheet.
- Verso/recto splits beyond named-string tricks need hand-written CSS.
- No single `site.yml` location for "the book title goes top-left on verso."

## Non-goals

- Piping web-layout-area content (`layout/header.md` etc.) into print. Web and print are separate concerns by design.
- Programmatic per-page running content ("different content on first 30 pages"). Expressible in CSS via named page contexts; not templated here.
- Rich HTML running elements — images, floats, content larger than a margin box. Paged.js supports `position: running(…)` + `content: element(…)` for these; deferred to a follow-up when a real use case lands.

## Convention

One block in `site.yml`, parsed as **[Loom](../../../loom/README.md) templates**. Loom is already a Press dependency (`@uniweb/loom`).

**Minimal useful example — one line:**

```yaml
book:
  running:
    footer: "{page} / {total}"
```

This adds "Page N / Total" in the outer bottom corner on both sides, leaves the chapter name in the outer top corner (from the default stylesheet), and is the entire authoring surface for a book that just wants slightly more informative page numbers.

**Full example — all six slots:**

```yaml
book:
  running:
    # All keys optional. Omitted keys keep the stylesheet default.
    header:        "{book.title} — {chapter}"   # both sides
    header-verso:  "{book.title}"               # overrides verso only
    header-recto:  "{chapter}"                  # overrides recto only
    footer:        "Page {page}"
    footer-verso:  "{page}"
    footer-recto:  "Page {page} of {total}"
```

### Two kinds of placeholders

| Placeholder | Resolves | Becomes in CSS |
|---|---|---|
| `{book.title}`, `{book.author}`, any `{x.y.z}` path into `site.yml` / `website.config` | Compile time (Loom dot-path access) | Quoted string literal |
| `{chapter}`, `{section}`, `{page}`, `{total}` | Runtime (browser) | `string(chapter)` / `string(section)` / `counter(page)` / `counter(pages)` |

Both kinds coexist in one template. Dynamic tokens flow through Loom as sentinel strings (Unicode PUA); the adapter detects sentinels in the rendered output and translates them into CSS function calls.

**Example.** Author writes `"{book.title} — {chapter}"`. The adapter:

1. Runs Loom with `vars = { book: bookCfg, site: websiteCfg, chapter: sentinel('chapter'), ... }`.
2. Gets rendered string `"The Uniweb Framework — ␀chapter␁"`.
3. Splits on sentinels, escapes literal segments, emits CSS function calls for sentinels.
4. Produces:

```css
@page :left  { @top-left  { content: "The Uniweb Framework" " — " string(chapter); } }
@page :right { @top-right { content: "The Uniweb Framework" " — " string(chapter); } }
```

### What Loom gives for free

Authors get Loom's static-evaluation power for the compile-time parts:

- **Dot-path access** — `{book.title}`, `{book.author.family_name}`.
- **Missing-field cleanup** — Loom quietly drops clauses whose data is missing, so `"{book.subtitle}: {book.title}"` renders as `"The Uniweb Framework"` when no subtitle exists.
- **Fallbacks & formatters** — any Loom construct over *static* data (Plain or Compact form; snippets if declared).

Full Loom reference: `framework/loom/docs/language.md`.

### The one constraint

Dynamic tokens (`{chapter}`, `{section}`, `{page}`, `{total}`) are **simple placeholders**. Two safe patterns:

1. **Bare token:** `{chapter}`
2. **Concatenation with literals:** `{book.title} — {chapter}`, `Page {page} of {total}`

Don't pipe dynamic tokens through `AS`, `TRUNCATED BY`, or any formatter — the sentinel string would be transformed before the adapter can read it, producing broken CSS. The adapter throws a slot-scoped error when it detects this.

Per-page conditional logic ("suppress header on blank pages") belongs in CSS, not Loom: add a named page context in the stylesheet and declare `@page <name> { @top-left { content: none; } }`.

### Position mapping (outer-corner default)

Four CSS-margin-box positions, authorable via six keys. Matches book typography and the current default stylesheet — a site adopting `book.running` for the first time sees no layout shifts in unrelated positions:

| Key | `:left` (verso) | `:right` (recto) |
|---|---|---|
| `header` | `@top-left` | `@top-right` |
| `header-verso` | `@top-left` | — |
| `header-recto` | — | `@top-right` |
| `footer` | `@bottom-left` | `@bottom-right` |
| `footer-verso` | `@bottom-left` | — |
| `footer-recto` | — | `@bottom-right` |

Authors who want center or inner positions extend the stylesheet directly. The adapter doesn't try to cover every Paged.js margin box.

## Non-negotiables

- **Omitting `book.running` changes nothing.** Existing output identical.
- **Layout areas stay web-only.** No automatic passthrough. Authors reuse web data in print by referencing the same Loom variables explicitly.
- **Short strings stand alone.** `footer: "{page}"` is the complete line.
- **Allowlist is stable.** `chapter`, `section`, `page`, `total` in v1. New dynamic tokens require a design amendment.
- **No new subpath.** All running-content logic lives inside `src/adapters/pagedjs.js`. If a second consumer emerges (EPUB? another HTML-string adapter?), principle 6 says extract then — not before.

## Implementation shape

### Adapter (`src/adapters/pagedjs.js`)

New `running` and `runningVars` options on `compilePagedjs`. The adapter owns everything — Loom invocation, sentinel management, CSS emission. Foundations don't touch Loom.

```js
compilePagedjs(input, {
  mode: 'html',
  stylesheet,
  meta,
  running: {                                      // NEW — raw YAML sub-object
    header: '{book.title} — {chapter}',
    footer: 'Page {page} of {total}',
  },
  runningVars: { book: bookCfg, site: websiteCfg },  // NEW — vars for Loom
})
```

Internally, the adapter:

1. For each declared slot, runs Loom with `runningVars` plus sentinel entries for the four dynamic tokens at the root of the vars namespace (`chapter`, `section`, `page`, `total`). Reserved root-level names — document in the adapter API.
2. Splits the rendered string on sentinels. Validates: no half-sentinels, no unknown token names between markers. Violations throw with the slot name.
3. Emits CSS: literal segments quoted and CSS-escaped (`"` → `\"`, `\` → `\\`); sentinels mapped to `string(chapter)` / `string(section)` / `counter(page)` / `counter(pages)`.
4. Generates one `@page :left { @<position> { content: ...; } }` rule per slot-side combination, respecting the six-key → four-position mapping.
5. Injects a `<style>` block **after** the foundation stylesheet so author overrides win on cascade.

Adapter footprint: ~80 LOC added to the existing file. Loom stays a runtime dep (already is).

### Foundations (`press-book`, `book-web`)

Four lines added to the Paged.js branch of each DownloadButton:

```js
adapterOptions: {
  mode: 'html',
  meta,
  stylesheet: pagedjsStylesheet,
  running: website.config.book?.running,                    // NEW
  runningVars: { book: bookCfg, site: website.config },     // NEW
}
```

If `book.running` is absent or empty, the adapter no-ops the entire feature — the stylesheet default runs unchanged.

### Default stylesheet (`@proximify/book-pagedjs-default`)

Unchanged. Authored overrides land *after* the default stylesheet; declared slots win, omitted slots keep the current default.

## Testing (all in `tests/pagedjs/adapter.test.jsx`)

1. Static-only template: `content: "Book Title";`.
2. Single dynamic token: `content: string(chapter);`.
3. Mixed static + dynamic: `content: "Book" " — " string(chapter);`.
4. CSS-string escaping: literal containing `"` emits `\"`; containing `\` emits `\\`.
5. Variant mapping: `header-verso` only emits `@page :left`, `:right` untouched.
6. `total` correctly maps to `counter(pages)`.
7. Author override wins over stylesheet default (injection-order invariant).
8. Dynamic token inside a transform construct throws with slot name: `/running-content slot 'header'.*leaf position only/`.

Approximately 8 test cases, one file, ~150 LOC test code.

### Live check in Chrome

- **framework-book** (no `book.running` configured): still paginates to 289 pages, default stylesheet unchanged.
- **universities-book** with sample `book.running: { header: "{book.title} — {chapter}", footer: "Page {page} of {total}" }`: verify margin boxes render declared content on both verso and recto; book title + chapter name in top outer corner; "Page N of 289" in bottom outer corner.

### Pre-merge verification (Phase-0 smoke test)

Before merging: verify Paged.js actually resolves `counter(pages)` to the post-pagination total page count (not `0` or an in-progress value). If `counter(pages)` doesn't work, drop `{total}` from v1 and document as a known limitation.

## Open questions

1. **How should author-declared snippets fit in (future)?** Loom supports `new Loom(snippets, customFns)` — authors could declare reusable fragments like `bookTitle: "{book.title}"` in `site.yml` at `book.running.snippets`. Out of v1 scope; add if a real authoring pattern emerges.
2. **What happens if the author uses `{total}` but Paged.js doesn't populate `counter(pages)` correctly?** Pre-merge verification above resolves this. If broken: drop `{total}` from the allowlist before shipping.

## What this is NOT

- Not a way to reuse web layout areas in print.
- Not a new Press format. Paged.js is already wired up; this extends its authoring surface.
- Not programmatic per-page logic — that's CSS.
- Not a new template language — the templating is Loom, already shipped.
- Not a new subpath or module — adapter-internal logic, extracted only if a second consumer materializes.

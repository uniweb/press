# EPUB adapter — design

**Status:** proposal, not yet implemented. Amended 2026-04-23 to reflect the adapter-descriptor refactor and `consumes` alias that shipped with Paged.js.
**Last updated:** 2026-04-23.
**Scope:** pure-frontend EPUB3 generation from Uniweb sections, plugged into Press's existing registration/compile pipeline. See also `./format-roadmap.md` for context on how EPUB fits the larger format space, and `../architecture/principles.md` for the commitments that shape the decisions below.

## Goals

- Produce a valid, reflowable EPUB3 file from the registered section fragments of a Uniweb site.
- Pure frontend. No backend, no WASM, no Pandoc. The adapter is dynamic-imported and adds zero bundle cost until `compile('epub')` is invoked.
- Same registration-and-compile ergonomics as docx and typst. A foundation author who already knows Press should not need a new mental model.
- Ship a preview story (compiled-blob in iframe via an EPUB reader) so the example site can preview EPUB output the way it previews docx today.

## Non-goals

- **Backend.** Deferred to the format-roadmap's backend discussion; not needed for EPUB.
- **EPUB2 as a first-class target.** EPUB3 is the standard. Whatever EPUB2 compat falls out via `toc.ncx` is best-effort.
- **Fixed-layout EPUB.** Children's books, comics, manga. Only reflowable in v1.
- **Media (audio/video), custom fonts, DRM.** All v2 material if they come up at all.
- **Multi-language inside one file.** One `.epub` per locale; multi-locale is a site-configuration concern.

## Input shape

**Declare `consumes: 'html'` in the adapter descriptor** (`src/adapters/dispatch.js`), reusing the same input-shape key Paged.js already reads.

Context: the adapter-dispatch refactor shipped with Paged.js (2026-04-23) introduced a `{ load, consumes, ir }` triple for each adapter. Paged.js declares `consumes: 'html', ir: false` — foundations register semantic HTML fragments under the `'html'` key, Paged.js reads them as rendered strings. EPUB can declare **`consumes: 'html', ir: false`** too: a foundation that already wired `useDocumentOutput(block, 'html', …)` for Paged.js gets EPUB registrations for free, no foundation changes.

This is a change from the earlier lean ("reuse HTML-IR, shared with docx"). Three reasons the `'html'` passthrough is now the stronger default:

1. **Proof of shape.** Paged.js validated rendered-HTML passthrough end-to-end on the framework-book site (289 pages, correct semantics, 339 tests green). We know the shape carries the information EPUB needs — semantic HTML with data-attributes foundations chose to attach.
2. **Registration sharing actually pays off.** With `consumes: 'html'` shared, foundations write one registration. The earlier "shared HTML-IR" story implied docx-style registrations would serve EPUB, which is less natural — EPUB chapters are semantic web HTML, not docx-flavored IR.
3. **Principle 6 carve-out already amended.** The "generalization already earned" paragraph added to `../architecture/principles.md` exists specifically because the alias seam was introduced with one adapter and clearly earned. Applying it here is consistent, not speculative.

**Adapter work remains substantial.** EPUB needs chapter splitting (by Page), per-Page XHTML files, nav construction, manifest assembly, image URL collection and rewriting. The `'html'` input shape just means the adapter starts from rendered HTML strings and does a parse5 walk over them (parse5 is already a Press dep) — rather than starting from an IR the foundation pre-rendered through a format-specific set of builders.

**HTML-IR reuse remains available as a fallback.** If it turns out the parse5 post-walk is clumsy for a specific EPUB need (e.g., semantic attributes the foundation attached that are easier to reach via IR than via an HTML parse), the adapter can switch to `consumes: 'docx'` or introduce `consumes: 'epub'` with its own registration key — per principle 4, abstraction level is per-format.

**Document-level structure (chapter boundaries, manifest, nav, spine) is owned by the adapter, not the input shape.** Mirrors how the typst adapter owns `ChapterOpener` / template machinery while consuming the shared HTML-IR for inline/block content.

**Empty-registrations warning.** Today's compile pipeline emits a one-time `console.warn` when no fragments are registered for an adapter's `consumes` key (see `CLAUDE.md` Gotchas). EPUB inherits this: a foundation that declares `compile('epub')` but never called `useDocumentOutput(block, 'html', …)` sees a helpful warning at click time, pointing at the right key to register under.

## Emitter choice

**`jszip` (already a dependency) + hand-written OPF/nav emitter.**

Alternatives considered:

- **Wrap `epub-gen-memory` or similar.** Rejected. The emitter is small enough (OPF + nav + XHTML chapters — all data transformations, no parsing) to control directly, and a library may not honor the no-parsing rule (principle 6) if it expects Markdown input. A hand-written emitter lets the HTML-IR flow through unchanged without a translation step.
- **Use `epub.js` builder APIs.** `epub.js` is a reader library, not a writer. Not applicable here (but we will use it for preview — see below).

## Bundle structure (what we emit)

```
mybook.epub                          (ZIP — not compressed as a whole)
├── mimetype                         (first entry, STORED not DEFLATED,
│                                     exact bytes "application/epub+zip")
├── META-INF/
│   └── container.xml                (points at OEBPS/content.opf)
└── OEBPS/
    ├── content.opf                  (package document: manifest + spine + metadata)
    ├── nav.xhtml                    (EPUB3 navigation document — primary TOC)
    ├── toc.ncx                      (EPUB2 NCX — optional, included for legacy readers)
    ├── styles.css                   (minimal stylesheet from theme vars)
    ├── chapters/
    │   ├── ch-01.xhtml
    │   ├── ch-02.xhtml
    │   └── ...
    └── images/
        ├── <hash>.png
        ├── <hash>.jpg
        └── ...
```

**Three invariants** (analogous to the three docx invariants in `src/adapters/docx.js`):

1. `mimetype` must be the first entry and stored uncompressed. Readers inspect the first ~60 bytes to identify EPUBs.
2. Every spine item must appear in the manifest and vice-versa; mismatches trigger reader errors.
3. Image paths in XHTML must match manifest paths exactly, including case and extension.

## Chapter boundaries

**One XHTML per `Page`.** Uniweb's Page is the natural structural unit — a "chapter" in the content graph already. The EPUB spine follows Page order; the nav doc groups by Page title.

**If a Page has multiple H1-level headings**, keep them in one XHTML. Splitting would fight Uniweb's structure and create navigation rules that don't exist in the content graph. Consistent with how docx and typst handle the same case.

**If a Page has no content (navigation-only folder per Uniweb's content-less container pattern)**, it is excluded from the spine but can still appear in the nav hierarchy as a group header.

## Asset handling

This is Press's **second adapter needing asset fetching** (docx does it inline today). Typst and Paged.js don't — Typst references images by URL for its compiler to resolve; Paged.js runs in a browser that resolves URLs natively. EPUB is the format that forces embedded bytes. Per principle 6 ("Extract shared logic when a second adapter needs it"), now is the trigger.

**Proposed new module: `src/assets/fetch.js`**

```js
// Pseudo-signature:
async function fetchAssets(urls) {
  // urls: string[] or Iterable<string>
  // Returns: Map<url, { bytes: Uint8Array, mime: string, hash: string }>
  // Dedupes by URL. Uses Promise.allSettled so one failure doesn't kill compile.
  // Detects MIME from Content-Type; falls back to extension.
  // Computes content hash for stable filenames.
}
```

**Proposed:** refactor docx to consume this helper in the same change. Doing both together is the right way to validate the API — if refactoring docx onto the helper is awkward, that is a signal the extracted API is wrong, and iterating on it before either adapter ships is much cheaper than after. If the docx refactor turns out to be disproportionately risky for this change (e.g., touches the three Word-clean invariants in non-trivial ways), split: ship EPUB on the new helper, leave docx on the inline path, and refactor docx in a follow-up.

**EPUB-specific asset flow at compile time:**

1. Walk the IR, collect `img` src URLs (and anything else the adapter knows to embed).
2. `fetchAssets()` returns the byte-and-mime map.
3. For each fetched asset, write to `OEBPS/images/<hash>.<ext>` in the ZIP.
4. Rewrite `<img src>` in XHTML chunks to the ZIP-relative path.
5. Add entries to the OPF manifest.

**Failures (lean default, revisit during implementation):** a failed image fetch leaves the `<img>` in place with its original URL and logs a warning; the resulting EPUB opens but may show a broken image (readers with network access may still fetch the URL). No placeholder emission, no tag stripping — the author sees the warning and fixes the source. If real-world reader behavior turns out to diverge sharply (e.g., air-gapped readers fail hard rather than gracefully), revisit; the alternative is to strip the `<img>` entirely and let the `alt` text surface in its place.

## XHTML conformance

EPUB3 readers are stricter than browsers. The emitter must produce valid XHTML:

- Self-closing tags for void elements (`<img .../>`, `<br/>`)
- Lowercase element names
- Always-quoted attributes
- Properly escaped `&`, `<`, `>` in text content
- A valid XHTML namespace declaration on the root `<html>` element

The existing HTML-IR carries content in a form that renders to HTML via `renderToStaticMarkup`. For EPUB, we need an XHTML serializer variant — either a thin wrapper that post-processes the HTML string to XHTML form, or a direct IR-to-XHTML walker. The direct walker is likely cleaner and avoids string-level hacks.

## Preview strategy

**Compiled-blob preview via `epub.js` in an iframe.** Not same-JSX preview — EPUB is a paginated reflowable format, and rendering it as a web page would mislead users about pagination, chapter navigation, and reflow behavior.

Implementation: add an `examples/preview-epub/` demo (or extend `preview-iframe/`) that loads `epub.js` and mounts the compiled Blob into a reader iframe. `epub.js` is a separate package, loaded only by the example — not a Press dependency.

## Metadata

EPUB3 requires a handful of package metadata fields (`dc:identifier`, `dc:title`, `dc:language`). Source them from:

1. **`role: 'metadata'` registration** if the foundation provides one — same pattern as typst's metadata role.
2. **Site config** (`site.yml`) as a fallback — `title`, `locale`, `author`, etc.
3. **Caller-provided `options.meta`** to `compile('epub', { meta: { ... } })` — wins over site config for one-off overrides.

`dc:identifier` is mandatory and must be unique per EPUB. If none is provided, generate a UUID at compile time.

## Testing

Mirror the docx test layout:

- **`tests/epub/adapter.test.js`** — compile a sample IR, verify:
  - PK magic bytes (`50 4b 03 04`)
  - `mimetype` is the first entry and STORED (compression method 0)
  - `container.xml` points at the correct OPF path
  - OPF manifest lists all XHTML chapters, the nav, and all images
  - OPF spine references all content items in order
  - Nav doc parses as valid XML and has a `nav[epub|type="toc"]`
  - Each chapter XHTML parses as valid XML
  - Image bytes in the ZIP match fetched bytes (round-trip check)

- **`tests/epub/components.test.jsx`** — only if we end up needing an `/epub` builder subset (see open question below). Likely unnecessary initially.

- **`tests/integration/epub-pipeline.test.jsx`** — end-to-end from registered sections through `compile('epub')` to Blob; mirrors the docx full-pipeline integration test.

- **Optional CI step: `epubcheck`.** The W3C's reference validator (Java CLI). Cleanest validation path, but Java is a heavy CI dep. Deferrable — start with the structural assertions above, add epubcheck if invalid-EPUB bugs slip through.

## Open questions (decide during implementation)

1. ~~**HTML-IR reuse vs. rendered-HTML passthrough.**~~ **Resolved (2026-04-23):** declare `consumes: 'html'` and take rendered HTML strings. See the "Input shape" section above. This decision is earned from Paged.js's shipped implementation, not speculated about. If concrete pain emerges during implementation (parse5 post-walk awkward for a specific EPUB need), the fallbacks are documented — switch to `consumes: 'docx'` (HTML-IR reuse) or introduce `consumes: 'epub'` (new key). Neither is expected to be needed.
2. **Do we need `/epub` builder components?** Probably not — foundations already register semantic HTML for Paged.js under `'html'`. EPUB reuses the same registrations. The existing practice (foundations use Kit components like `<Render>` and `<Prose>` for HTML output) works. If EPUB-specific authoring emerges (e.g., `epub:type` attribute conventions for footnotes), introduce `/epub` as its own subpath then. `/docx` builder reuse is not the path — `/docx` builders carry docx-specific attributes, and routing foundations to register via docx builders *for EPUB* sends the wrong signal about the input-shape relationship.
3. **Cover image: declared how?** Options: (a) a convention on metadata role (`{ cover: '/path/to/cover.png' }`); (b) a new `role: 'cover'` registration; (c) a site.yml field. Lean toward (a) — simplest, no new registration roles, consistent with how other EPUB metadata flows.
4. **Multiple spines / split guides?** EPUB3 supports `guide` and `collection` elements for advanced structuring. Skip in v1.
5. **Theme → CSS:** reuse `@uniweb/theming` token emission to produce the EPUB stylesheet, or ship a Press-authored minimal style pack? Probably consume theming tokens — EPUB readers respect CSS custom properties, and theme parity with the web view is valuable. Confirm during implementation.
6. **Inline styles vs. external stylesheet?** EPUB3 allows both. External stylesheet is cleaner, reduces XHTML size, and lets readers override user-chosen themes. Default to external.

## File additions (expected)

```
src/
├── adapters/
│   ├── epub.js                   (compileEpub, buildContainer, buildOpf,
│   │                               buildNav, buildChapter, emitXhtml)
│   └── dispatch.js               (ADD entry to ADAPTERS:
│                                   epub: { load: () => import('./epub.js'),
│                                           consumes: 'html', ir: false })
├── assets/                       (NEW — extracted per principle 6)
│   └── fetch.js                  (fetchAssets, detectMime, hashContent;
│                                   internal — adapters import directly,
│                                   no barrel, not in package.json exports)
└── epub/                         (ONLY if we end up needing EPUB-specific builders;
                                    likely skipped in v1)
    └── index.js

tests/
├── epub/
│   ├── adapter.test.js
│   └── components.test.jsx       (only if /epub exists)
└── integration/
    └── epub-pipeline.test.jsx

examples/
└── preview-epub/                 (optional — can fold into preview-iframe instead)
    └── ...

src/adapters/docx.js
└── (REFACTOR) consume src/assets/fetch.js instead of inlined fetch
```

The ADAPTERS map lives in `src/adapters/dispatch.js` (as of the adapter-descriptor refactor shipped 2026-04-23). The descriptor is `{ load, consumes, ir }` — not the older single-function form.

## Out of scope for v1 (explicit)

- Fixed-layout EPUB
- Embedded audio/video
- DRM / encryption
- Custom fonts (reader-default fonts only)
- Footnote-heavy formatting (basic footnotes work via the existing builders; EPUB's `epub:type="noteref"` conventions are v2)
- Multi-level hierarchical TOC beyond Page grouping (flat per-page nav in v1)
- Localized metadata (`xml:lang` attributes across multiple locales in one file)

## When this doc should be deleted

This file is scaffolding for one implementation task. Once the EPUB adapter is merged, tests are passing, and the principles/overview docs reflect the new reality, **delete this file.** The code and tests are the authoritative spec from that point on. Leaving the design doc around after the fact is exactly the staleness trap the principles preamble warns against.

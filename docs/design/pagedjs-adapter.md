# Paged.js adapter — design

**Status:** proposal, ready to implement (Phase 1 is the unlock).
**Last updated:** 2026-04-23.
**Scope:** pure-frontend PDF generation from Uniweb sites via CSS Paged Media, plugged into Press's existing registration/compile pipeline. See also `./format-roadmap.md` for context on how Paged.js fits the larger format space, `./epub-adapter.md` for a sibling pure-frontend format with different trade-offs, and `../architecture/principles.md` for the commitments that shape the decisions below.

---

## Goals

- Produce a book PDF from a Uniweb site with zero backend and zero install. The browser paginates; the user's print driver rasterizes.
- Ship alongside the existing Typst adapter as a peer. Foundations can offer both Download buttons; users pick based on their needs (Typst for deterministic typography, Paged.js for zero-backend static deployment and unified web/print CSS).
- Reuse the existing whole-subtree aggregation — `compileSubtree(elements, 'pagedjs', options)` walks a React subtree, collects every `useDocumentOutput` registration, and hands the store to the adapter. No new orchestration machinery.

## Non-goals

- Replacing the Typst adapter. Typst stays.
- Print quality for non-narrative documents. Paged.js is for books, articles, reports — prose-shaped content. Spreadsheets stay xlsx; forms stay docx.
- A CSS Paged Media authoring library. Paged.js itself is that library. Press ships a thin adapter and a default stylesheet that's good enough for typical book content.
- Deterministic byte-for-byte PDF output. Paged.js can't deliver that; Typst already does.
- EPUB from the same pipeline. EPUB is a separate format with its own packaging spec — see `./epub-adapter.md`.

## Why Paged.js, and not the alternatives

- **WASM Typst in the browser** (`typst.ts`) — can produce PDF bytes directly in a browser tab, but requires a multi-megabyte WASM download and only compiles Typst source, so foundations authoring in CSS don't benefit. Duplicates what Typst server mode already does; doesn't open a new deployment shape.
- **LaTeX-in-WASM** — less maintained than Typst WASM; LaTeX source is harder to author; the sources-mode user handoff is weaker (`texlive` is ~5 GB, engines differ). No new deployment shape.
- **Paged.js** — browser-native, ~100 KB polyfill, unifies web and print CSS. **Unique value: PDF from a static-hosted site with no backend at all.** Additive: some deployments want Typst's determinism, some want Paged.js's zero-backend story, some want both.

---

## Key architectural insight

Typst and Paged.js solve the same problem (book-shaped PDF from a Uniweb site) but at different points in the pipeline.

- **Typst:** Press walks JSX → IR → emits Typst source → sends source to a compiler that produces PDF. Adapter owns IR walking and source emission.
- **Paged.js:** Press walks JSX → emits HTML → serves HTML to the browser → Paged.js (loaded in that browser) polyfills CSS Paged Media and paginates → the user's print engine rasterizes to PDF. Adapter owns HTML assembly and orchestrating the browser load.

**Consequences for the adapter:**

- **No IR walk.** Paged.js consumes HTML. `compileOutputs` for Paged.js is passthrough — keep each fragment's rendered HTML string; do not walk it to IR. This is principle 4 (`principles.md` §4) in action: an adapter can skip the IR layer when the IR is not the natural input for the target format. Walking JSX → HTML → IR → HTML would round-trip and lose information (nested spans with classes, inline styles, data-attributes the foundation chose to put there) that foundation authors rely on Paged.js to use.
- **No compiler invocation in the adapter.** In `html` mode (Phase 1), the adapter returns an HTML Blob; the caller loads it in a browser context (new tab or iframe). In `server` mode (Phase 3), the adapter POSTs the HTML to an endpoint running headless Chromium + Paged.js + print-to-PDF.
- **Typography is CSS.** The foundation ships a CSS Paged Media stylesheet that extends (or replaces) the site's web CSS. This is the actual leverage — print typography reuses web-CSS authoring. The CSS-only additions are page geometry, running headers, page counters, chapter opener rules — all declarative, all in `@page` / `string-set` / `@top-right` and friends.
- **Fonts just work.** Whatever web fonts (`@font-face`, Google Fonts, self-hosted) the web version uses, Paged.js uses too — same browser, same stack.
- **Indeterminism.** Unlike Typst's deterministic byte output, PDF quality depends on the user's browser and print driver. Usually stable in modern Chromium; weaker in Firefox/Safari. This is a genuine trade-off vs. Typst.

---

## Architecture

Four layers, inside-out. File paths are under `framework/press/`.

### Layer 1: HTML-passthrough branch in the compile pipeline

The existing `src/ir/compile.js` has two branches: `compileXlsx` (plain object passthrough) and `compileHtmlBased` (HTML → IR walk). Paged.js needs a third — **HTML passthrough without IR walk.**

Proposed shape:

```js
// src/ir/compile.js
export function compileOutputs(store, format) {
    const outputs = store.getOutputs(format)
    if (format === 'xlsx') return compileXlsx(outputs)
    if (format === 'pagedjs') return compilePagedjs(outputs, store)
    return compileHtmlBased(outputs, store)  // existing: docx, typst
}

function compilePagedjs(outputs, store) {
    const wrap = store.wrapWithProviders || ((x) => x)
    let metadata = null
    const sections = []
    for (const { fragment, options } of outputs) {
        const role = options.role || 'body'
        if (role === 'metadata') {
            metadata = fragment  // plain object, same as typst
            continue
        }
        // Phase 1: only body matters. Header/footer for Paged.js become
        // CSS margin boxes via @page rules, not registered sections.
        if (role !== 'body') continue
        const html = renderToStaticMarkup(wrap(fragment))
        sections.push(html)
    }
    return { sections, metadata }  // sections is an array of HTML strings
}
```

Key: **`sections` for Paged.js is an array of HTML strings**, not IR arrays. The adapter concatenates them into the document body.

### Layer 2: the adapter

At `src/adapters/pagedjs.js`, mirroring `src/adapters/typst.js`:

```js
// src/adapters/pagedjs.js
export async function compilePagedjs(input, options = {}) {
    const { mode = 'html', meta = {}, stylesheet, ...rest } = options

    const body = (input.sections || []).join('\n')
    const resolvedMeta = { ...(input.metadata || {}), ...meta }
    const doc = emitDocument({ body, meta: resolvedMeta, stylesheet })

    if (mode === 'html') {
        return new Blob([doc], { type: 'text/html; charset=utf-8' })
    }
    if (mode === 'server') {
        return compileServerSide(doc, rest)
    }
    throw new Error(
        `pagedjs adapter: unknown mode "${mode}". ` +
            `Valid modes: 'html' (returns paged-ready HTML), 'server' (POSTs HTML to endpoint, receives PDF).`,
    )
}

function emitDocument({ body, meta, stylesheet }) {
    // Build a full HTML document that, when loaded in a browser, kicks off
    // Paged.js via the polyfill script. The polyfill auto-runs on
    // DOMContentLoaded and paginates the body.
    const lang = meta.language ?? 'en'
    const title = meta.title ?? 'Book'
    const css = stylesheet || DEFAULT_STYLESHEET
    const metadataHtml = emitMetadata(meta)

    return `<!doctype html>
<html lang="${escapeAttr(lang)}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>${css}</style>
    <script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js" defer></script>
    ${emitMetaTags(meta)}
  </head>
  <body>
    ${metadataHtml}
    ${body}
  </body>
</html>`
}

async function compileServerSide(htmlDoc, options = {}) {
    const endpoint = options.endpoint || '/__press/pagedjs/compile'
    const form = new FormData()
    form.append('document.html', new Blob([htmlDoc], { type: 'text/html' }), 'document.html')
    const res = await fetch(endpoint, { method: 'POST', body: form })
    if (!res.ok) {
        const text = await res.text().catch(() => '(no body)')
        throw new Error(
            `pagedjs adapter (server mode): ${endpoint} returned ${res.status} ${res.statusText}.\n${text}`,
        )
    }
    const blob = await res.blob()
    return blob.type === 'application/pdf'
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: 'application/pdf' })
}
```

Notes:

- **No IR, no builders library, no adapter-side compilation** in `html` mode. The whole adapter is HTML string assembly + Blob wrapping.
- **`emitMetadata`** produces a hidden `<div data-pagedjs-metadata>` block with title / author / etc. as inline `<span>`s. Pure Paged.js convention — values can be pulled into `@page` margin boxes via `string-set` + `string()` CSS functions. Alternative: emit `<meta>` tags and let CSS `attr()` pull them. Either works; pick one in Phase 0 and document in the default stylesheet.
- **`DEFAULT_STYLESHEET`** is a CSS string — minimum Paged Media setup so books compile cleanly without a custom foundation stylesheet. Parallels `DEFAULT_PREAMBLE` / `DEFAULT_TEMPLATE` in the Typst adapter. Foundations override.
- **`escapeHtml` / `escapeAttr`** — small helpers to prevent title/lang values with special chars from breaking the output.

### Layer 3: adapter dispatch registration

Add one entry to `src/adapters/dispatch.js` as a `{ load, consumes, ir }` descriptor:

```js
const ADAPTERS = {
    docx:    { load: () => import('./docx.js'),    consumes: 'docx',  ir: true  },
    xlsx:    { load: () => import('./xlsx.js'),    consumes: 'xlsx',  ir: false },
    typst:   { load: () => import('./typst.js'),   consumes: 'typst', ir: true  },
    pagedjs: { load: () => import('./pagedjs.js'), consumes: 'html',  ir: false },  // new
}
```

The `consumes: 'html'` is load-bearing: foundation sections call `useDocumentOutput(block, 'html', …)`, not `'pagedjs'`. Keeps the foundation wiring stable when a future EPUB adapter lands — EPUB will also declare `consumes: 'html'` and read the same registrations with zero foundation changes. Principle 6's "When the generalization is already earned" carve-out (see `principles.md`).

Extend the compile-fn lookup in `runCompile`:

```js
const compileFn =
    adapter.compileDocx ||
    adapter.compileXlsx ||
    adapter.compileTypst ||
    adapter.compilePagedjs ||  // new
    adapter.compilePdf
```

### Layer 4: optional Vite dev plugin (Phase 3, not Phase 1)

At `src/vite-plugin-pagedjs.js`, a plugin that answers server mode. Under the hood: Puppeteer or Playwright launches headless Chromium, loads the POSTed HTML, waits for Paged.js's `afterRendered` event, triggers `emulateMediaType('print')` + `page.pdf({ printBackground: true })`, returns the PDF.

Implementation is routine but heavy — requires a Chromium binary. Not Phase 1.

---

## Phase 0: verify assumptions

Do these checks before writing code. Each is fast and any one can invalidate part of the plan.

1. **Paged.js polyfill actually works in modern Chromium with minimal HTML.**
   Drop this into a scratch HTML file and open in Chrome:

   ```html
   <!doctype html>
   <html>
     <head>
       <script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>
       <style>
         @page { size: 6in 9in; margin: 0.75in; @top-right { content: counter(page); } }
         h1 { break-before: page; }
       </style>
     </head>
     <body>
       <h1>Chapter 1</h1><p>Para.</p>
       <h1>Chapter 2</h1><p>Para.</p>
     </body>
   </html>
   ```

   Verify: pages are bounded, page numbers appear in top-right, each `<h1>` starts on a new page. If this doesn't work, Paged.js has regressed or the polyfill URL changed — update the plan.

2. **Read `src/adapters/typst.js` fully** before editing. The Typst adapter is the most recent and closest-shape analog; follow its conventions for error message phrasing, mode dispatch, and options handling. Don't diverge without cause.

3. **Read `src/ir/compile.js` fully** — the `compileHtmlBased` function shows exactly how roles are dispatched. The new `compilePagedjs` function should sit alongside it with minimum duplication.

4. **Read `src/compileRegistrations.js`** to confirm that the whole-subtree aggregation primitive is format-agnostic — it is; `compileOutputs(store, format)` does the per-format branch.

5. **Confirm that `website.pages` + `page.loadContent()` work as expected** if your Download button needs to aggregate across pages. The Typst flow already handles this; follow the same pattern.

Deliverable: a ~5-minute sanity check HTML saved locally, plus confirmation that each of the referenced files is understood. No code commits from this phase.

**Phase-0 decisions to make:**

1. **Paged.js version / source URL.** `unpkg.com/pagedjs/dist/paged.polyfill.js` is the stock recommendation. Pin the version (`unpkg.com/pagedjs@<x.y.z>/...`) so the book render is stable, or use latest? Lean: pin.
2. **Metadata block encoding: inline spans (for `string()`) or `<meta>` tags (for `attr()`).** Either works. Lean: inline spans in a hidden div — more flexible for authors who want to show metadata on a title page.

---

## Phase 1: MVP — `html` mode + default stylesheet

**Goal:** a Download button on a book-shaped Uniweb site that produces a `text/html` Blob. Opening the Blob in a new tab triggers Paged.js pagination. The user clicks Print → Save as PDF to get the PDF. Works today with zero backend and zero install.

### Files to create in Press

- `src/adapters/pagedjs.js` — the adapter from Layer 2 above, with `mode: 'html'` only. `mode: 'server'` throws "not yet implemented" for now.
- `src/ir/compile.js` — extend `compileOutputs` with the `pagedjs` branch (Layer 1).
- `src/adapters/dispatch.js` — add `pagedjs` to ADAPTERS map + add `compilePagedjs` to the compile-fn OR-chain.
- `tests/pagedjs/adapter.test.jsx` — unit tests (see Testing below).

Nothing to add to `package.json`'s `exports` — the adapter is private (lazy-loaded via dispatch), just like typst. Principle 2 applies.

### Files to create outside Press (foundation-side)

These belong in the foundation that owns the book DownloadButton, not in Press itself:

- **A Paged.js default stylesheet library.** Mirrors the Typst default-library pattern used in book-shaped foundations: a small workspace package that exports a single `stylesheet` string (the CSS Paged Media sheet), consumed by the foundation's DownloadButton. Keeps the CSS editable outside Press and re-usable across sibling foundations. Structure: one `package.json` + a `src/` with the stylesheet exported as a `String.raw` literal from a `.js` module (see Gotcha 1 below for why `.css?raw` imports are not used).
- **A third button on the foundation's DownloadButton component.** `"PDF (Paged.js)"` alongside any existing Typst / .zip buttons. Click handler uses `compileSubtree` with `format: 'pagedjs'` and opens the resulting Blob in a new tab (see snippet below).

### The default stylesheet (starter — refine after the first render)

```css
/* Page geometry — 6×9 US trade size */
@page {
  size: 6in 9in;
  margin: 0.75in 0.5in 0.75in 0.75in;
}
@page :left  { margin: 0.75in 0.75in 0.75in 0.5in; }
@page :right { margin: 0.75in 0.5in 0.75in 0.75in; }

/* Named string for running headers — each h1 sets it, margin box reads it */
h1 { string-set: chapter content(); }

@page :left  { @top-left  { content: string(chapter); font-size: 9pt; color: #666; } }
@page :right { @top-right { content: string(chapter); font-size: 9pt; color: #666; } }

/* Page number footer */
@page :left  { @bottom-left  { content: counter(page); font-size: 9pt; } }
@page :right { @bottom-right { content: counter(page); font-size: 9pt; } }

/* Chapter openers: start on recto (right-hand page) */
h1 { break-before: recto; page: chapter-opener; font-size: 22pt; margin-top: 2in; }
@page chapter-opener { @top-left { content: none; } @top-right { content: none; } }

/* Body typography */
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 11pt;
  line-height: 1.45;
  hyphens: auto;
}
p { margin: 0 0 0.75em; text-indent: 1.25em; }
p:first-of-type, h1 + p, h2 + p, h3 + p { text-indent: 0; }
h2 { font-size: 14pt; margin: 1.5em 0 0.5em; page-break-after: avoid; }
h3 { font-size: 12pt; margin: 1.2em 0 0.4em; page-break-after: avoid; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 0.92em; }
pre  { font-size: 9.5pt; padding: 0.8em; background: #f5f5f5; overflow: hidden; page-break-inside: avoid; }
blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding: 0 0 0 1em; color: #444; font-style: italic; }
ul, ol { margin: 0.5em 0 0.75em 1.5em; }
```

Refine once the first real book render is visible. The starter above is enough to get a recognizable printed book from existing content.

### Download button shape

Extending an existing DownloadButton:

```jsx
// Phase 1 addition to an existing DownloadButton
import { stylesheet as pagedjsStylesheet } from '<your-foundation-stylesheet-library>'

// In the click handler for the new button:
const blob = await compileSubtree(
    <ChildBlocks blocks={blocks} />,
    'pagedjs',
    {
        basePath: website?.basePath,
        adapterOptions: { mode: 'html', meta, stylesheet: pagedjsStylesheet },
    },
)
// Don't triggerDownload — the user needs the document rendered by a browser.
const url = URL.createObjectURL(blob)
window.open(url, '_blank')
// URL.revokeObjectURL(url) — defer; the opened tab needs the URL live.
```

**Important:** `triggerDownload(blob, filename)` is **wrong** for `html` mode. The file is a pagination-target, not a saved artifact. Open it in a new tab so Paged.js can run. For `server` mode (Phase 3), `triggerDownload` is correct because the response is already a rendered PDF.

### Testing

Mirror `framework/press/tests/typst/adapter.test.jsx`:

- **Smoke:** `compilePagedjs({ sections: [], metadata: null })` with `mode: 'html'` returns a `text/html` Blob with a `<!doctype html>` prefix and a `<script src="https://unpkg.com/pagedjs...`.
- **Content embedding:** given two sections as HTML strings, the output contains both strings in order, inside `<body>`.
- **Metadata:** given `metadata: { title: 'X', author: 'Y' }`, the output has `<title>X</title>` and the metadata block emits `author`.
- **Unknown mode:** `mode: 'bogus'` throws with a helpful message.
- **WASM / nonexistent mode:** throws. (There's no `wasm` mode for Paged.js; don't implement it.)
- **Server mode existence:** `mode: 'server'` calls `fetch(endpoint)` with `multipart/form-data` containing one field named `document.html`. Unit test with a mocked `fetch` (pattern from `tests/typst/adapter.test.jsx` server-mode tests).

No IR-walker tests needed — Paged.js skips the IR.

Integration test (optional for Phase 1, harder): render sample book markdown through `compileRegistrations` with `format: 'pagedjs'`, assert the result contains chapter titles and paragraphs. Skip the actual pagination (that needs a real browser).

### Deliverable check for Phase 1

- Existing Press test suite stays green; new `pagedjs` tests added.
- A book-shaped test site has a working "PDF (Paged.js)" button.
- Clicking it opens a new tab; Paged.js renders the book into pages; browser Print → Save as PDF produces a reasonable-looking book PDF.
- Rough page-count parity with the Typst-produced PDF (slight drift is fine; CSS Paged Media doesn't hit the exact same pagination as Typst).

### What can go wrong in Phase 1 (known gotchas)

- **Paged.js polyfill paginates on DOMContentLoaded.** If the browser's print dialog shows unpaginated content, the polyfill script didn't run in time. Make sure the `<script>` tag has `defer` and is placed before `</head>`.
- **The browser caches the opened `blob:` URL after the tab closes.** If the user re-clicks the Download button, the second Blob creates a new URL — fine, don't try to reuse the first.
- **`font-family: Georgia` works on most systems**, but if you want a specific font, the foundation's stylesheet must `@font-face` it. Web fonts loaded by Paged.js are the same as web fonts on a web page.
- **`break-before: recto` requires Paged.js**, not native browser support (no browser fully implements CSS Paged Media natively; Paged.js is the polyfill). Don't write CSS that assumes native support.
- **Metadata fields (e.g., `isbn`)**: Paged.js doesn't require any specific schema. The emitter should quietly include values in the metadata block if present — foundations can opt in via CSS to show them on a copyright page.

---

## Phase 2: prettier CSS + polish

**Goal:** refine the default stylesheet based on actual rendering. Add anything that looks missing or broken after Phase 1's first end-to-end pass. Also: polish the Download button (title, filename, progress state) in the consuming foundations.

Common follow-ons after staring at the first PDFs:

- **Table of contents.** CSS Paged Media can't generate a TOC from nothing; Paged.js has a `toc` convention using `<nav>` + `target-counter(attr(href), page)`. Foundation-level: add a `<nav id="toc">` stub to the emitted document (before body content) that Paged.js auto-populates. Or skip TOC in Phase 2 and flag as a known limitation.
- **Copyright / title pages.** Short front matter that doesn't come from chapter markdown. Options: (a) the foundation emits them as registered `role: 'body'` fragments using special CSS classes; (b) the adapter emits them from `meta` if the fields are present. (a) is more flexible, (b) is easier.
- **Drop caps, small caps, section dinkuses.** Typographic niceties. Add to the stylesheet as wanted.
- **Image handling.** Paged.js respects `break-inside: avoid` for `<figure>` elements; confirm the emitted HTML wraps images appropriately.
- **Page-count parity check vs. Typst.** Compare the same book compiled via Typst and via Paged.js. Small gaps are acceptable (different typesetting engines, different fonts); big gaps suggest a CSS issue.

No new Press code in this phase; just stylesheet iteration and button polish.

---

## Phase 3: `server` mode + Vite dev plugin

**Goal:** one-click PDF via a backend that runs headless Chromium + Paged.js. Mirrors the existing Typst `server` mode + `@uniweb/press/vite-plugin-typst` architecture.

### Wire protocol

- **Request:** `POST /__press/pagedjs/compile`, `Content-Type: multipart/form-data`, body: one field named `document.html`, value is a Blob of `text/html`.
- **Response 200:** `Content-Type: application/pdf`, body is the rendered PDF.
- **Response 4xx/5xx:** `Content-Type: text/plain`, body is the error message (surfaced in the DownloadButton).

### Vite plugin implementation (`src/vite-plugin-pagedjs.js`)

Follow the pattern in `src/vite-plugin-typst.js`:

- `apply: 'serve'` (dev-only).
- Mounts middleware at configurable path (default `/__press/pagedjs/compile`).
- Middleware: parses multipart, writes `document.html` to a temp file, launches Puppeteer, navigates to a `file://` URL for the document, waits for `window.PagedPolyfill.afterRendered` or a similar signal (check Paged.js docs), emulates print media, calls `page.pdf({ printBackground: true, format: 'A4' })` (or uses `@page size` from the CSS), returns the PDF.
- Error handling: Chromium not installed, Paged.js didn't finish, print errored — all become 500 responses with clear bodies.

Heavier than the Typst plugin — needs `puppeteer` or `puppeteer-core` as a dependency. Puppeteer installs Chromium on `npm install` (large). Workarounds: `puppeteer-core` + a user-supplied `executablePath` so Chromium isn't re-downloaded per project. Decide at implementation time.

### Production endpoints

Document the wire protocol in `framework/press/docs/guides/book-publishing.md` (extend the existing Typst server-mode section). Reference implementations for:

- **AWS Lambda** — container image with Chromium. Works well.
- **Vercel / Netlify** — supported via their Chromium-friendly serverless runtimes.
- **Cloudflare Workers** — Chromium isn't cleanly hostable in the Worker runtime today; callers in a Workers environment would POST to a Lambda-backed endpoint or similar.

---

## Phase 4: DRY the Download button (optional)

By Phase 3, foundations offering both Typst and Paged.js end up with several click handlers in their DownloadButton: Typst sources (.zip), Typst server (PDF), Paged.js html (new tab), Paged.js server (PDF). Same pattern, repeated per foundation.

If this duplication becomes painful, hoist the generic DownloadButton into a shared foundation-side library — a `<BookDownloadButton modes={[...]}>` component that consuming foundations import. Optional; skip if foundations stay divergent.

---

## Decisions already made (rationale logged)

These don't need re-debating during implementation:

1. **`html` mode is the Phase 1 primary.** `server` is Phase 3. WASM is not applicable (Paged.js is inherently browser-run; there is no WASM version).
2. **No IR walk for Paged.js.** The rendered HTML *is* the output format. Extend `compileOutputs` with an HTML-passthrough branch. (Principle 4.)
3. **Default stylesheet lives in a foundation-side library, not in Press.** Press ships a `DEFAULT_STYLESHEET` as a minimal fallback; foundations consume their own stylesheet library for real book typography. Matches the Typst default-library pattern.
4. **Multipart wire protocol for server mode** — same shape as Typst server mode (one field per file). Makes future Press infrastructure reusable.
5. **`pagedjs` subpath for React builders is deferred.** No initial plan for `@uniweb/press/pagedjs` builders. Most sites emit HTML via Kit's existing components and don't need custom Press builders. Add only if a pattern emerges. Phase 5+ if ever.
6. **Fonts are a foundation concern.** Press doesn't manage fonts; the foundation's stylesheet declares `@font-face` or uses `<link rel="stylesheet" ...>` — Paged.js inherits browser font behavior.
7. **Adapter descriptor with `consumes:` alias, introduced with Paged.js (not deferred to second HTML adapter).** Adapters are `{ load, consumes, ir }` triples; foundations register under the input-shape key (`'html'`) while callers still name the output format (`'pagedjs'`). This is a principle-6 carve-out: the shape was determined by the first adapter plus the existing registration contract, not by speculation about EPUB. See principle 6's "When the generalization is already earned" paragraph for the test applied. Second HTML adapter (EPUB) will reuse the same `'html'` registrations with zero foundation changes.

## Open questions (decide during implementation)

1. **Metadata block encoding:** inline spans (for CSS `string()`) vs. `<meta>` tags (for CSS `attr()`). Either works; lean inline spans.
2. **Chromium provisioning for server mode (Phase 3):** bundled `puppeteer` vs. `puppeteer-core` with user-supplied `executablePath`. Defer to Phase 3.

---

## Code anchors (read before implementing)

Paths relative to `framework/press/`. What to learn from each:

- `src/adapters/typst.js` — full file. The shape to mirror: `compile<Format>` signature, mode dispatch, `emitDocument`-style helpers, error message phrasing, `compileServerSide` implementation.
- `src/adapters/dispatch.js` — full file. How to register a new adapter.
- `src/ir/compile.js` — full file. Where to add the Paged.js passthrough branch.
- `src/compileRegistrations.js` — full file. The aggregation primitive; format-agnostic. No changes needed.
- `src/vite-plugin-typst.js` — full file. Template for the future Paged.js dev plugin in Phase 3.
- `tests/typst/adapter.test.jsx` — full file. Test patterns to copy for `tests/pagedjs/adapter.test.jsx`.
- `tests/typst/vite-plugin.test.jsx` — full file. If/when Phase 3 happens.

Consumer side (outside Press, in your own foundation/library workspace): follow whatever pattern your existing Typst-backed book foundation uses for DownloadButton and default-stylesheet library. Paged.js slots in alongside, not in replacement.

---

## Gotchas inherited from the Typst work

Things learned during the Typst implementation that are easy to miss:

1. **Vite dep-optimizer chokes on non-standard file extensions inside dependencies.** When the Typst adapter tried to import `.typ?raw` files that lived inside a `file:`-linked workspace package, esbuild (Vite's dep-optimizer) errored with "No loader for .typ files." Solution: keep canonical source in `.js` files that export the Typst/CSS string as a template literal. Same applies if a Paged.js foundation is tempted to import raw `.css?raw` from a dependency — don't; export the CSS as a `String.raw\`...\`` literal in a `.js` module.

2. **`workspace:*` vs `file:` deps in pnpm.** pnpm's `file:` deps *copy* the package into `node_modules` rather than symlinking. In-place edits to the source don't propagate. Use `workspace:*` (or `link:*`) so pnpm symlinks.

3. **React version coherence across a workspace.** pnpm hoists identical React versions to a single copy, but if a peerDep resolves to a different version, you get two React instances and "Objects are not valid as a React child" errors. Pin React at the workspace root; new Press code should not introduce any React peerDep range that could resolve differently.

4. **jsdom's Blob ≠ undici's Blob.** In vitest's jsdom environment, `instanceof Blob` can fail when the Blob was produced by a Node `fetch()` response. Use duck-type checks (`typeof blob.size === 'number'`) in tests, not `instanceof`.

5. **Don't forget to extend `runCompile`.** Adding a format to the `ADAPTERS` map is necessary but not sufficient; `runCompile` in `dispatch.js` also has a compile-fn lookup chain that needs the new adapter's `compile<Format>` function name added.

6. **The `metadata` registration role exists.** `useDocumentOutput(website, format, metaObj, { role: 'metadata' })` — document-level properties keyed on `website` (not a block). The compile pipeline captures these separately from body sections. Paged.js should read it the same way Typst does.

7. **Absolute URL handling in the adapter.** Foundation components that emit `<img src="/assets/...">` rely on `BasePathContext` to resolve correctly when the site is deployed under a subdirectory. The DocumentProvider re-wraps fragments with the context during compile. Paged.js inherits this for free because it renders HTML via `renderToStaticMarkup` — same flow as Typst. **But be aware:** if the emitted HTML is served from a `blob:` URL (which has no site origin), `<img src="/assets/...">` won't resolve. Solution: make sure image URLs in the emitted HTML are fully resolved to absolute URLs (e.g., `http://localhost:5173/assets/...`) at compile time. The `BasePathContext` value during compile should be the full origin, not a relative prefix.

8. **Test environment for the Vite plugin (Phase 3) needs `@vitest-environment node`** directive at the top of the file. jsdom's fetch + multipart handling doesn't work cleanly for server tests. Copy the pattern from `tests/typst/vite-plugin.test.jsx`.

---

## Non-negotiables

- **Do not remove or change the Typst flow.** Books must keep producing working Typst PDFs (both sources and server modes) through every phase.
- **Do not put the Paged.js adapter in `package.json`'s `exports` field.** It must remain private, reached only via the `ADAPTERS` map. (Principle 2.)
- **Do not add React peerDeps in new Press code.** Press is already pinned; anything new reuses the existing peerDep range.
- **Do not break existing tests.** Keep the full Press suite green; add pagedjs tests on top.

---

## References

- [Paged.js documentation](https://pagedjs.org/documentation/) — official docs, particularly the "CSS Paged Media" and "Named strings" sections.
- [Paged.js repo](https://github.com/pagedjs/pagedjs) — source, version pinning reference.
- [CSS Paged Media Module Level 3](https://www.w3.org/TR/css-page-3/) — the spec Paged.js polyfills.
- [CSS Generated Content for Paged Media](https://www.w3.org/TR/css-gcpm-3/) — the running-headers / page-numbers spec.
- `../guides/book-publishing.md` — extend this guide with a Paged.js section after Phase 1.

---

## When this doc should be deleted

This file is scaffolding for one implementation task. Once the Paged.js adapter is merged, Phases 1–3 have shipped (or been explicitly punted), and the principles / overview / roadmap docs reflect the new reality, **delete this file.** The code and tests become the authoritative spec from that point on.

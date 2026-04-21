# Press architecture

This is a contributor-oriented description of how Press is put together and why. If you are *using* Press — wiring up a Download button, writing a section component that opts into a format — read [Concepts](../concepts.md) and the guides first. This document is for people extending Press: adding a new format adapter, writing a production compile endpoint, porting the pipeline to a new runtime, or thinking about what fits in Press and what doesn't.

## What Press is

Press is a **registration layer** plus a set of **format adapters**. The registration layer is small, format-agnostic, and owns no opinions about what the output should look like. The adapters are big, format-specific, and own every opinion about that format. The boundary between them is a single compiled shape per format, produced by walking the registration store at compile time.

```
                   ┌───────────────────────────────────────┐
                   │ Site (live React tree)                │
                   │                                       │
                   │  <DocumentProvider> ─── useDocumentOutput(block, format, fragment)
                   │       │                               │
                   └───────┼───────────────────────────────┘
                           │
                           ▼
                   ┌───────────────────────┐
                   │ Registration store    │  WeakMap<Block, Map<format, entry>>
                   │ + insertion order     │
                   └───────────┬───────────┘
                               │
                               ▼
                   ┌──────────────────────┐
                   │ compileOutputs       │  per-format dispatch
                   │ (IR walk or         │  HTML-based: renderToStaticMarkup → htmlToIR
                   │  passthrough)        │  data-shape: identity
                   └───────────┬──────────┘
                               │
                               ▼
                   ┌─────────────────────────────────────┐
                   │ Adapter (lazy-loaded)               │
                   │  docx.js   typst.js   xlsx.js       │
                   │  (never in the main bundle)         │
                   └───────────┬─────────────────────────┘
                               │
                               ▼
                            Blob
```

Nothing in the core of Press knows what `"docx"` means. The format string is an arbitrary tag; the registration fragment is whatever shape that adapter consumes; the adapter is a single dynamic-imported module with one public function. Adding a new format is additive.

## The registration model

Registration is the contract between section components and the compile pipeline. A section component, during its render, calls:

```js
useDocumentOutput(block, format, fragment, options)
```

Several details worth pinning down:

**The key is the `block`**, not a page, not a section name. Blocks are Uniweb's per-section runtime instances — identity is stable across re-renders of the same section, distinct across sections of the same type. The provider's store is a `WeakMap<Block, Map<format, entry>>` so unmounted block references become eligible for GC. A parallel `blockOrder` array preserves insertion order because `WeakMap` isn't iterable.

**Registration is synchronous during render**, not in `useEffect`. Walker code runs right after React finishes rendering — effects haven't flushed yet. This is deliberate: if we waited for effects, the compile pipeline would have to wait too, which would force every download flow to be async in a place where it doesn't need to be. Registration-during-render is idempotent (same block+format overwrites), so Strict Mode's intentional double-render is harmless.

**The fragment is adapter-specific.** For HTML-based formats (docx, typst, pdf-via-paged) the fragment is JSX — the walker renders it to HTML and parses to IR. For data-shape formats (xlsx) it's a plain object like `{ title, headers, data }`. For a hypothetical JSON-export adapter it could be any serialisable value. The registration layer has no opinion.

**Roles are the only axis of structure.** `options.role` is `'body'` (default), `'header'`, `'footer'`, or `'metadata'`. Body fragments append to a `sections` array in registration order; header/footer are single (last wins); metadata is a plain pass-through object for document-level properties. Adding a new role is a tiny change in one file.

## Two aggregation primitives

Historically, Press had one compile path: `useDocumentCompile()` reads the active page's provider, compiles, returns a Blob. One page → one document. This is enough for short documents (a CV, a one-page report, a typical docusite).

Books broke this model: one URL per chapter, one chapter per render, a Download button whose scope is *all chapters*. The store attached to the active route sees only one chapter's registration.

Press now has a second primitive, `compileSubtree`, which renders any React subtree off-screen through a `DocumentProvider` with an externally-owned store. Whatever subtree you pass gets rendered via `renderToStaticMarkup`; any `useDocumentOutput` calls land in the external store; the store is then compiled.

The subtree can be any React tree — often `<ChildBlocks blocks={allBlocksFromEveryPage} />` which pulls blocks out of `website.pages` and renders them bare. No page routing, no effects, no DOM mounts. Uniweb's object graph — `Website → Page → Block` — is plain JS, already populated, so walking it is free; React is a *transform* over that graph, not a mounting concern.

The two primitives sit side by side:

```
┌───────────────────────────────────────────────────────────────┐
│  useDocumentCompile()        │  compileSubtree(elements, fmt) │
│  ---------------------       │  --------------------------    │
│  Reads the mounted           │  Owns its own off-screen       │
│  provider's store.           │  store via createStore().      │
│                              │                                │
│  Scope: whatever's           │  Scope: whatever subtree the   │
│  currently rendering live.   │  caller assembles.             │
│                              │                                │
│  Sync in, Promise<Blob> out. │  Sync assembly, Promise<Blob>  │
│                              │  out via compileSubtree sugar. │
│                              │                                │
│  Right for:                  │  Right for:                    │
│  - single-page documents     │  - whole-site (book) downloads │
│  - on-the-page compile       │  - build-time SSG compile      │
│                              │  - headless export pipelines   │
└───────────────────────────────────────────────────────────────┘
```

Both funnel into the same `compileOutputs(store, format)` → adapter dispatch pipeline. The difference is only in *how the store got populated*.

## The IR: when it helps, when it gets in the way

Press ships a compact intermediate representation (IR) for HTML-based fragments. The walker `htmlToIR(html)` parses HTML via parse5 and produces a tree of `{ type, ...properties, children? }` nodes. `type` comes from the element's `data-type` attribute (falling back to the tag name); other `data-*` attributes map to properties via a declarative attribute map (`attributeMap` in `ir/attributes.js`).

The IR is a **useful intermediate only when multiple format adapters can consume the same tree.** Today that includes docx and typst. Both read the IR, dispatch by `type`, and emit format-specific output (docx library calls vs Typst source strings). The upside is concrete: a Press-aware foundation can produce both `.docx` and `.typ` from the same JSX registrations by switching the format string.

The IR gets in the way when:

- The format's model has no reasonable HTML analogue (xlsx: spreadsheets aren't typography; a tagged blob walker gains nothing over a plain `{ title, headers, data }` object).
- The format has first-class features that don't survive an HTML round-trip (Typst's show rules, LaTeX's custom commands, Paged.js's CSS paged media — these escape via a `<Raw>` builder rather than being modelled in IR).
- The format is an export, not a rendering (a JSON-schema dump, a CSV, a structured archive).

For those cases, adapters accept the registered fragment as-is. The `compileOutputs` pipeline dispatches by format: HTML-based formats go through IR; others are passthrough. See the xlsx adapter as a reference for the data-shape pattern.

## Adapter patterns

Two canonical shapes cover most formats Press will want to support.

### HTML-based adapters (docx, typst, paged.js, LaTeX)

The fragment is JSX emitting semantic HTML with `data-*` attributes. Walker produces IR. Adapter iterates IR nodes, dispatches by `type`, and emits format-native output.

```
JSX → renderToStaticMarkup → HTML string → htmlToIR → IR tree → adapter-specific emit
```

Shared infrastructure that HTML-based adapters reuse:
- `parseStyledString` (inline HTML marks → text runs with style flags + hyperlinks). Lives under `src/docx/` but is format-agnostic — the typst adapter imports it. Will migrate to `src/` when a third adapter picks it up.
- `resolveUrl` + `BasePathContext` (absolute-URL resolution under subdirectory deployments). Same story — lives in `src/docx/`, imported by typst, promotes to `src/` on third use.
- `fetchImageData` equivalent (asset-URL → bytes for embedded images). Docx has this in `src/adapters/docx.js`; typst doesn't yet (images are referenced by URL in `#image("url")` and the compiler resolves them at compile time). LaTeX would follow the typst pattern; Paged.js keeps the URL references because the browser does the resolving.

### Data-shape adapters (xlsx, custom JSON exports)

The fragment is a plain JavaScript object whose shape the adapter defines. No HTML, no IR. `compileOutputs` collects the fragments into an array and passes them through.

```
Plain object → collected in registration order → adapter reads directly
```

Useful for formats that aren't rendered documents — spreadsheets, machine-consumable JSON exports, domain-specific XML, compiled data feeds.

## What it would take to add a new format

### Adding a LaTeX adapter

LaTeX is architecturally the same shape as Typst: source-code-first typography, PDF produced by a compiler that runs on the source, named typography primitives that source authors call into (`\chapter`, `\subsection`, `\emph`, etc.).

The work:

1. New subpath `@uniweb/press/latex` with React builder components that mirror `/typst`. The same `data-type` vocabulary (`heading`, `paragraph`, `codeBlock`, `list`, `blockQuote`, `image`, `table`, `chapterOpener`, `asterism`) carries over unchanged.
2. New adapter at `src/adapters/latex.js`. Walks the same IR the typst adapter walks; emits different source strings. Heading level N → `\chapter`/`\section`/`\subsection`/`\subsubsection` instead of `=` repeated. Paragraph IR → LaTeX source with inline marks (`\textbf{...}`, `\emph{...}`, `\texttt{...}`). Code blocks → `\begin{lstlisting}[language=...]...\end{lstlisting}` or `\begin{minted}`. Lists → `\begin{itemize}` / `\begin{enumerate}`. Blockquotes → `\begin{quotation}`. Images → `\includegraphics`. Tables → `tabular`.
3. Foundation-supplied preamble + template (LaTeX preamble with `\documentclass`, package imports, `\usepackage`, custom command definitions for chapter-opener equivalents, etc.).
4. Compile modes:
   - `sources`: 5-file bundle (`main.tex` + `meta.tex` + `content.tex` + `preamble.tex` + `template.tex`), zipped by jszip.
   - `server`: same multipart/form-data wire protocol, but the endpoint runs `pdflatex` / `xelatex` / `lualatex` (often needing multiple passes for refs/index/TOC). Our Vite plugin grows a `latexCompile()` next to the existing `pressTypstCompile()`, or we generalise it.

What's reusable and what's new:

| Area | Reuse | New |
|---|---|---|
| React builders | shape + attribute vocabulary | different emit prefixes — but builders can be a thin re-export of the typst ones with different display names if the attribute set matches |
| IR walker | yes, verbatim | — |
| Compile pipeline | yes | add `latex` to `ADAPTERS` map |
| Aggregation (`compileSubtree`) | yes | — |
| Sources/server mode machinery | shape | new endpoint + new binary dispatch |

A minimal LaTeX adapter is probably ~500–800 lines (IR walker emit + defaults + a few escape-hatch builders for LaTeX-isms). Call it a week of focused work.

### Adding a Paged.js adapter

Paged.js is architecturally different: it runs in a *browser*, takes HTML + CSS Paged Media (CSS `@page`, `page-break-*`, running headers, named strings), and produces a print-ready PDF via the browser's print engine. There's no separate "compile" — the browser does the layout.

This changes the adapter shape. Paged.js consumes the same HTML the web view might render; the "compile" step is "render the whole book into a hidden iframe, let Paged.js paginate it, then print-to-PDF." Two sensible compile-mode shapes:

- **`html` mode**: aggregate every section into one big HTML document (using the `compileSubtree` primitive to walk all pages) and return it as a `Blob` with `type: 'text/html'`. The caller loads it into an iframe with Paged.js's polyfill; the user prints to PDF from there. Zero server.
- **`server` mode**: aggregate into HTML, POST to an endpoint that runs headless Chrome + Paged.js and returns the PDF. This is roughly what [PagedJS](https://pagedjs.org) itself provides server-side.

What Paged.js specifically unlocks is typography you write in CSS. Running headers, book-style left/right page variation, margin boxes with chapter names, drop caps, cross-references resolved at print time via named strings — all CSS. Foundations that already have strong CSS typography for the web get a lot of the printed typography for free. You still need to write CSS Paged Media for the *print-specific* bits (`@page { size: 6in 9in; margin: ...; @top-right { content: string(chapter) } }`), but the body typography can come from the existing CSS.

Notably, **the IR isn't what Paged.js consumes** — HTML is. So the Paged.js adapter skips the IR walker entirely: take each registration fragment's JSX, `renderToStaticMarkup` it, concatenate into a document, serve. That's the whole adapter in ~100 lines plus a good `<Layout>` + CSS Paged Media stylesheet.

The reason Paged.js didn't ship in our initial Typst-focused work: Typst is a cleaner PDF story (no browser dependency, deterministic output, reproducible across machines). Paged.js is a better *web-native* story. They solve different problems. Both deserve to ship — Paged.js probably before LaTeX because it unlocks "PDFs from the site's existing CSS" with the least new code.

### Generalising to "any format"

If you're writing an adapter not modelled above, the checklist:

1. Decide: HTML-based or data-shape? If the format has anything like markdown-shaped prose, HTML-based is cheaper. If it doesn't, data-shape.
2. Design the builder surface (or skip — data-shape formats often need no builders; users register plain objects).
3. Write the adapter at `src/adapters/<format>.js` exporting one `compile<Format>(compiledInput, documentOptions) → Promise<Blob>` function.
4. Register the format in `adapters/dispatch.js`'s `ADAPTERS` map so `runCompile(format, ...)` finds it.
5. Update `compileOutputs` in `ir/compile.js` if the format needs a new dispatch branch (most don't — passthrough is the default for non-HTML formats; HTML formats use the shared `compileHtmlBased`).
6. If the format needs React builders, add them at `src/<format>/` with a matching subpath in `package.json` exports. Don't put the adapter itself in exports — users should always go through `useDocumentCompile` / `compileSubtree` so the adapter stays lazy-loaded.
7. Tests: one unit pass for each builder (IR shape), one integration pass for the full pipeline (`compileOutputs` + adapter round trip).

## Compile modes

Press's modes trade off who runs the compiler and where.

| Mode | Who runs the compiler | PDF output? | Dependencies | Production viable? |
|---|---|---|---|---|
| `sources` | User, locally after unzipping | User produces it | `jszip` | Always (no backend) |
| `server` | Backend at a POST endpoint | Server returns PDF | Compiler on server | Yes, with hosted endpoint |
| `wasm` (roadmap) | Browser WASM runtime | Browser returns PDF | Large WASM download | Yes if WASM mature |

Every mode uses the same `compileSubtree` call. Only `adapterOptions.mode` changes. A foundation can ship multiple modes and expose them as separate buttons. The Press guide for books does this: primary button is `server` (one-click PDF), secondary is `sources` (always-works fallback).

The modes are per-format. Typst has all three on the roadmap. docx has only a direct-compile mode (the docx library produces the Blob in-browser from the IR — no sources-equivalent makes sense because the docx XML isn't useful to hand-edit). xlsx similarly compiles directly. LaTeX would mirror Typst: sources + server, skip wasm (LaTeX-in-browser is heavier and less mature than Typst-in-browser).

## Production endpoints

The Vite dev plugin (`pressTypstCompile`) is convenient for local development but is **explicitly dev-only** (`apply: 'serve'`). Production deployments of a Press-driven site need their own compile endpoint that speaks the same wire protocol.

### The wire protocol

One HTTP operation, two shapes.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: one field per bundle file, field name equal to filename. For Typst: `main.typ`, `meta.typ`, `content.typ`, `preamble.typ`, `template.typ`. The server writes them verbatim into a temp directory and runs the compiler.

**Response:**
- Success: `200 OK`, `Content-Type: application/pdf`, body = PDF bytes.
- Failure: any `4xx` / `5xx`, `Content-Type: text/plain; charset=utf-8`, body = the compiler's stderr or a meaningful error message. The DownloadButton surfaces the body text to the user.

Point the button at your endpoint:

```jsx
<DownloadButton endpoint="https://api.example.com/press/typst/compile" />
```

The client-side code doesn't care where the endpoint lives. Same protocol, same Blob back.

### Reference implementations

The endpoint is small. Key design points: stateless (no session), short-lived temp directories per request, no persistence, aggressive timeouts. The actual compile is the only work.

**Express / Node:**

```js
import express from 'express'
import multer from 'multer'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const app = express()
const upload = multer()

app.post('/press/typst/compile', upload.any(), async (req, res) => {
  const dir = await mkdtemp(join(tmpdir(), 'press-'))
  try {
    for (const f of req.files) {
      await writeFile(join(dir, f.fieldname), f.buffer)
    }
    const out = join(dir, 'out.pdf')
    await runTypst(['compile', join(dir, 'main.typ'), out])
    res.type('application/pdf').send(await readFile(out))
  } catch (err) {
    res.status(500).type('text/plain').send(err.message || String(err))
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

function runTypst(args) {
  return new Promise((resolve, reject) => {
    let stderr = ''
    const p = spawn('typst', args)
    p.stderr.on('data', (b) => (stderr += b))
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr))))
  })
}
```

~25 lines. Ship it behind your API gateway; it scales horizontally because nothing is shared state.

**AWS Lambda (container image):**

Package the `typst` binary into a container image (Dockerfile `FROM public.ecr.aws/lambda/nodejs:20` + `RUN apt-get install typst` or download-and-extract). Handler reads `event.body` (API Gateway decodes multipart if configured), runs the same Node code as above, returns `base64` body with `isBase64Encoded: true`. Cold-start concern: the Typst binary adds ~10 MB to the image; warm-start is fine.

**Cloudflare Worker:**

More constrained — no native binaries. Two options:
- Use a Worker → Container Service (Workers → Dispatch) to run the binary in a separate container, returning results through the Worker.
- Use a browser-WASM Typst port. `@myriaddreamin/typst-ts-web-compiler` can run in a Worker's V8 isolate with the right WASM setup. Same wire protocol on the client side; different implementation on the server.

**Serverless function on Vercel / Netlify:**

Same shape as Lambda, different packaging. Vercel's serverless runtime supports attaching a binary via `includeFiles`; Netlify's background functions are fine for the 10-second-ish compile budget.

### Operational concerns

- **Timeouts.** Typst's compiler is fast (single-digit seconds for a 200-page book on modern hardware). Set the endpoint's timeout at 30s; any book longer than that isn't being served well by a synchronous request anyway.
- **Concurrency.** Stateless compiles parallelise trivially. Bound concurrency via the platform's autoscaling or explicit queue if needed.
- **Payload size.** Bundles are typically a few hundred KB of source. `content.typ` grows linearly with book size but stays under a few MB even for large books. Keep the endpoint's max body size at 10 MB.
- **Caching.** Same bundle → same PDF (Typst is deterministic). A hash of the bundle is a legitimate cache key; served from a CDN, popular-book downloads become free after the first request.
- **Fonts.** See below.

## Fonts

Fonts interact with each adapter differently:

**Typst.** The `typst` binary reads fonts from system paths, `--font-path`, or the embedded defaults (New Computer Modern). A server endpoint can ship a font directory and pass `--font-path`; the Vite dev plugin exposes `extraArgs` for that. For in-browser Typst (the `wasm` mode, once it ships), fonts must be loaded explicitly into the WASM runtime — the foundation has to declare a fonts manifest and the adapter has to forward it. For `sources` mode, fonts are the user's problem — they compile locally with whatever they have installed.

**docx.** The `docx` library writes font names into the docx XML; whoever opens the file (Word, Pages, LibreOffice) resolves them at open time. No fonts ship with the file. This is why Word documents look different across machines — you're relying on the reader having your fonts installed. If you need font fidelity, embed the fonts as a Word feature (docx supports this; the library has options for it) or ship the fonts alongside the .docx as a note for recipients.

**Paged.js (when it ships).** Fonts are regular web fonts — loaded via `@font-face` in CSS, resolved by the browser. Same font story as the web view. This is actually the simplest path for font fidelity: whatever fonts your site uses for the web, Paged.js will use for the print PDF.

**LaTeX (when it ships).** LaTeX typically uses its own font configuration (pdfLaTeX has legacy font packages; XeLaTeX and LuaLaTeX can load system TrueType/OpenType). A server endpoint passes the font-config file alongside the sources. Matches the Typst story closely.

General pattern across all adapters: **font policy is a foundation decision, not a Press decision.** Press exposes a hook (a string argument, an options object, a directory path) that the foundation fills in. No font logic lives in Press core.

## What Press deliberately doesn't do

Keeping these out keeps the core small.

- **Content parsing.** Markdown → ProseMirror → semantic-parser → `{ content, block }` is upstream. Press consumes whatever shape the runtime has already produced. If you want to use Press outside Uniweb, produce that shape yourself.
- **Data fetching.** Uniweb's `EntityStore`, block-level fetch configs, and Loom expressions run before Press. A chapter that interpolates live data looks identical to a static chapter from Press's point of view.
- **Template-engine expansion.** Same as above — if `content.paragraphs[0]` says `"Published in 2026"`, that string has already been expanded by the time Press sees it. Placeholder resolution isn't Press's job.
- **Routing.** Pages, navigation, active-route highlighting — foundation/runtime concerns. Press's `compileSubtree` works regardless of the active route; it never interacts with the router.
- **Server infrastructure.** Press ships the Vite dev plugin because it's a two-line install that makes local development work. Production endpoints are deliberately out of scope — the wire protocol is tiny, and every deployment has its own hosting story. Press documents the protocol and reference implementations; it doesn't ship a worker.
- **Font management.** See above.
- **Cross-format compile orchestration.** You can call `compileSubtree` twice with different formats to get two artifacts from the same content. Press doesn't provide a "compile all formats at once" API because the common case is "the user clicked one button for one format" and batch orchestration belongs in the caller.

## Design constraints

A few choices that shape the whole pipeline.

### Registration has to be synchronous-during-render

Already discussed in the registration-model section. The alternative (registration in `useEffect`) was rejected because it forces every compile flow to be async-with-effect-wait, which makes `renderToStaticMarkup` + "immediately compile" impossible. The walker runs right after React finishes; registrations are already there.

### Adapters must be dynamic-imported

The `docx` library alone is ~3.4 MB. The Typst WASM runtime will be larger. If these were in the main bundle, every site would pay for them on every page load. The lazy-load contract is enforced by keeping adapters *out of* `package.json`'s `exports` field — the only way to reach them is through the `ADAPTERS` map in `adapters/dispatch.js`, which uses dynamic `import()`. Bundlers emit the adapter as a separate chunk and fetch it on first compile.

This is also why `compileSubtree` exists as a sibling of `useDocumentCompile` rather than a variant of it: both funnel through the same `runCompile` in `dispatch.js`, preserving one lazy-load path across both APIs.

### The provider re-wraps fragments at compile time

Section components render inside a full React context stack — BasePathContext, Uniweb runtime context, Kit contexts, foundation contexts. When the compile pipeline re-renders fragments via `renderToStaticMarkup`, it starts outside that stack; builders that read context see defaults and emit, e.g., unprefixed URLs.

The provider exposes `store.wrapWithProviders(children)` — a closure capturing the current prop stack. The compile pipeline calls it to re-wrap each fragment before rendering. Adding a new context a builder needs (theme, locale, foundation props) is one line inside `wrapWithProviders` in `DocumentProvider.jsx`; the compile pipeline doesn't need to change.

### Aggregation is store-centric

`createStore()` builds a store that's not tied to a React component. `DocumentProvider store={externalStore}` uses it instead of building one internally. `compileRegistrations` and `compileSubtree` create their own stores, render the subtree into them, and hand them to `compileOutputs`.

This decouples the store from the mount lifecycle. The same store could be populated over multiple render passes (if you had a reason), or populated by non-React code (if you had a reason). Neither of those is a documented use case today — they're consequences of the design.

## Current status and near-term work

Shipped: docx adapter + `/docx` builders, xlsx adapter, typst adapter + `/typst` builders + `compileSubtree` + Vite dev plugin, IR layer, sections helpers, the `metadata` role.

Near-term candidates (no commitments, contributor-ordered):

1. **Paged.js adapter.** Probably the highest-leverage next format — unlocks "PDFs from your site's CSS" with minimal new code and matches the "web as its own modality" story well. Needs a small adapter (~100 lines), a CSS Paged Media starter stylesheet, and the Download UX for loading a hidden iframe.
2. **Asset pipeline for Typst.** Images in Typst books are currently URL-referenced; the compiler resolves them at compile time. Bundling images into the compile bundle (hash + rewrite, mirror of docx's `fetchImageData` flow) makes the sources ZIP self-contained.
3. **LaTeX adapter.** Described above. Lower priority than Paged.js because Typst already covers the "compiler-based PDF" niche.
4. **`wasm` mode for Typst.** Tracks `@myriaddreamin/typst.ts` shipping a PDF export. When that lands, `wasm` mode becomes a one-file adapter + a dynamic-imported WASM chunk. Biggest unlock: no-server PDF generation for sites deployed on static hosts.
5. **Reference production endpoint.** A one-file deployable (Cloudflare Worker with a container sidecar, Lambda container image, Vercel function) that speaks the wire protocol, ready to deploy behind an API gateway. Might live outside Press's main package — possibly as `@uniweb/press-compile-server` — to keep Press itself a pure client library.

## See also

- [Concepts](../concepts.md) — user-facing mental model: four modes of combining preview and registration.
- [Publishing a book](../guides/book-publishing.md) — how the book pipeline is set up end to end.
- [Writing a custom adapter](../guides/custom-adapter.md) — tactical checklist for adding one format.
- [The preview pattern](../guides/preview-pattern.md) — using `docx-preview` for a cross-check view of compiled output.

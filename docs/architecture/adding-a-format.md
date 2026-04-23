# Adding a format to Press

This doc is for contributors writing a new format adapter. It assumes you have read [principles.md](./principles.md) and [overview.md](./overview.md) — the commitments and the current architecture, respectively. For what's currently shipped and what's next in the pipeline, see [format-roadmap.md](./format-roadmap.md).

A Press adapter is a single module at `src/adapters/<format>.js` exporting one `compile<Format>(compiledInput, documentOptions) → Promise<Blob>` function, plus (usually) a set of React builder components at `src/<format>/` that section authors use to register fragments. Everything else is either reused from core or specific to the format.

## Decide the adapter shape first

Three shapes cover essentially every format Press will ever support. Pick one before writing any code; the choice determines what the rest of the adapter looks like.

### 1. HTML-based with IR (docx, typst)

The fragment is JSX that renders to semantic HTML with `data-*` attributes. The walker produces the HTML-IR. The adapter iterates the IR tree, dispatches by `type`, and emits format-native output.

```
JSX → renderToStaticMarkup → HTML string → htmlToIR → IR tree → adapter emit
```

Right for formats that model the same things HTML models — headings, paragraphs, lists, tables, inline marks, images. Most structured-document formats sit here. Shares infrastructure with other HTML-based adapters (`parseStyledString`, `resolveUrl`, future asset fetching).

### 2. Data-shape passthrough (xlsx)

The fragment is a plain JavaScript object whose shape the adapter defines. No HTML, no IR. `compileOutputs` collects the fragments into an array in registration order and hands them to the adapter unchanged.

```
Plain object → collected in registration order → adapter reads directly
```

Right for formats that aren't rendered documents at all — spreadsheets, machine-consumable JSON exports, domain-specific XML, compiled data feeds. The xlsx adapter is the reference implementation; any future "export the site as structured data" adapter will look similar.

### 3. Rendered-HTML passthrough (future Paged.js, future static-HTML export)

The fragment is JSX, same as shape 1, but the adapter skips the IR entirely. Each fragment is rendered to HTML with `renderToStaticMarkup`, concatenated, and that *is* the compile output (possibly wrapped in a `<Layout>` + stylesheet).

```
JSX → renderToStaticMarkup → HTML string → concatenate → Blob (text/html) or print pipeline
```

Right for formats where HTML is the final deliverable, or where a browser-based tool (Paged.js, the browser's print engine, a headless Chrome service) does the layout work that an IR-walker would otherwise do. Keeps the same-source preview story (the preview *is* the compile input) without the IR layer in between.

### When you can't pick one

If the format seems to want a fourth shape, stop and write it up in a design doc before coding. Press has deliberately kept abstraction decisions per-format (see [principle 4](./principles.md#4-abstraction-level-is-per-format)) — adding a new shape is fine, but doing it by accident is how drift starts.

## The checklist

Once the shape is chosen, the work looks like this. Every step is required; most are small.

1. **Pick the fragment shape.** For HTML-based adapters, this is usually "JSX emitting HTML with `data-type` attributes." For data-shape adapters, design the plain-object schema you want adapter authors to register (`{ title, headers, data }` for xlsx; whatever makes sense for yours).

2. **Write the adapter.** One file at `src/adapters/<format>.js`, exporting `compile<Format>(compiledInput, documentOptions) → Promise<Blob>`. For HTML-based: walk the IR, dispatch by node type, emit. For data-shape: read the passed-through objects, build the output. For rendered-HTML passthrough: concatenate the rendered fragments, wrap in whatever shell the format needs.

3. **Register the format in the `ADAPTERS` map** in `src/useDocumentCompile.js`:
   ```js
   <format>: () => import('./adapters/<format>.js')
   ```
   This is the only place in Press that references the adapter module directly. The dynamic `import()` is what keeps the adapter out of the main bundle — see [principle 2](./principles.md#2-adapters-are-dynamic-imported).

4. **Update `compileOutputs` in `src/ir/compile.js`** only if the format needs a new dispatch branch. Most don't — passthrough is the default for non-HTML formats; HTML formats use the shared `compileHtmlBased`.

5. **If the format needs React builders, add them at `src/<format>/`** with a matching subpath in `package.json`'s `exports` field. Don't put the adapter itself in `exports` — users should always reach it through `useDocumentCompile` / `compileSubtree` so it stays lazy-loaded.

6. **Decide the preview strategy** and document it. Same-source (same JSX renders both the preview and the compile input — docx and typst do this), compiled-blob (render the output Blob back into an iframe, e.g. `docx-preview`), or none. See [principle 8](./principles.md#8-same-source-preview-is-a-feature-not-a-rule).

7. **Tests.** One unit pass per builder (render to static HTML, parse to IR, assert the IR shape). One integration pass for the full pipeline (`compileOutputs` + adapter round trip). Reference: `tests/integration/enriched-components.test.jsx`.

## Worked example: LaTeX

LaTeX is architecturally the same shape as Typst — source-code-first typography, PDF produced by a compiler that runs on the source, named typography primitives that source authors call into (`\chapter`, `\subsection`, `\emph`, etc.). This makes it a shape 1 (HTML-based with IR) adapter that closely mirrors typst.

The work:

1. **New subpath `@uniweb/press/latex`** with React builder components that mirror `/typst`. The same `data-type` vocabulary (`heading`, `paragraph`, `codeBlock`, `list`, `blockQuote`, `image`, `table`, `chapterOpener`, `asterism`) carries over unchanged — builders can be thin re-exports of the typst ones with different display names if the attribute set matches exactly.

2. **New adapter at `src/adapters/latex.js`.** Walks the same IR the typst adapter walks; emits different source strings. Heading level N → `\chapter` / `\section` / `\subsection` / `\subsubsection` instead of `=` repeated. Paragraph IR → LaTeX source with inline marks (`\textbf{...}`, `\emph{...}`, `\texttt{...}`). Code blocks → `\begin{lstlisting}[language=...]...\end{lstlisting}` or `\begin{minted}`. Lists → `\begin{itemize}` / `\begin{enumerate}`. Blockquotes → `\begin{quotation}`. Images → `\includegraphics`. Tables → `tabular`.

3. **Foundation-supplied preamble + template** (LaTeX preamble with `\documentclass`, package imports, `\usepackage`, custom command definitions for chapter-opener equivalents, etc.). Same pattern as Typst's preamble/template split.

4. **Compile modes.**
   - `sources`: 5-file bundle (`main.tex` + `meta.tex` + `content.tex` + `preamble.tex` + `template.tex`), zipped by `jszip`. This is the primary mode — pure frontend, no backend required, user compiles locally with their own LaTeX installation.
   - `server`: same multipart/form-data wire protocol as Typst, but the endpoint runs `pdflatex` / `xelatex` / `lualatex` (often needing multiple passes for refs/index/TOC). Secondary mode per [principle 3](./principles.md#3-frontend-first-backends-are-escape-hatches).

**What's reusable and what's new:**

| Area | Reuse | New |
|---|---|---|
| React builders | shape + attribute vocabulary | different emit prefixes — builders can be thin re-exports of the typst ones |
| IR walker | verbatim | — |
| Compile pipeline | verbatim | add `latex` to `ADAPTERS` map |
| Aggregation (`compileSubtree`) | verbatim | — |
| Sources mode machinery | shape | new bundle layout |
| Server mode machinery | protocol | new endpoint + new binary dispatch |

Note that LaTeX does not have a realistic WASM path today (LaTeX-in-browser is heavier and less mature than Typst-in-browser), so the frontend-first story is carried by `sources` mode rather than by in-browser compilation. That's the format's nature, not a Press choice.

## Worked example: Paged.js

Paged.js is architecturally different. It runs in a *browser*, takes HTML + CSS Paged Media (CSS `@page`, `page-break-*`, running headers, named strings), and produces a print-ready PDF via the browser's print engine. There's no separate "compile" — the browser does the layout.

This changes the adapter shape. Paged.js consumes the same HTML the web view might render; the "compile" step is "render the whole book into a hidden iframe, let Paged.js paginate it, then print-to-PDF." It's a shape 3 (rendered-HTML passthrough) adapter.

Two sensible compile-mode shapes:

- **`html` mode** (primary): aggregate every section into one big HTML document using `compileSubtree` and return it as a `Blob` with `type: 'text/html'`. The caller loads it into an iframe with Paged.js's polyfill; the user prints to PDF from there. Zero server. This is the mode that earns Paged.js its place in Press — it's the cleanest expression of the frontend-first commitment for PDF output.
- **`server` mode** (optional): aggregate into HTML, POST to an endpoint that runs headless Chrome + Paged.js and returns the PDF. This is roughly what [pagedjs.org](https://pagedjs.org) provides server-side. Useful for one-click PDF downloads where the user shouldn't have to use browser print; secondary per [principle 3](./principles.md#3-frontend-first-backends-are-escape-hatches).

**What Paged.js specifically unlocks** is typography you write in CSS. Running headers, book-style left/right page variation, margin boxes with chapter names, drop caps, cross-references resolved at print time via named strings — all CSS. Foundations that already have strong CSS typography for the web get a lot of the printed typography for free. You still need to write CSS Paged Media for the *print-specific* bits (`@page { size: 6in 9in; margin: ...; @top-right { content: string(chapter) } }`), but the body typography can come from the existing CSS.

Notably, **the IR isn't what Paged.js consumes** — HTML is. So the Paged.js adapter skips the IR walker entirely: take each registration fragment's JSX, `renderToStaticMarkup` it, concatenate into a document, serve. That's the whole adapter, plus a good `<Layout>` component and a CSS Paged Media stylesheet.

## Reusable infrastructure

Three shared utilities are available to any HTML-based adapter, with varying maturity:

- **`parseStyledString`** — inline HTML marks → text runs with style flags + hyperlinks. Format-agnostic despite living under `src/docx/`; typst imports it. Will migrate to `src/` when a third adapter picks it up, per [principle 6](./principles.md#6-extract-shared-logic-when-a-second-adapter-needs-it).
- **`resolveUrl` + `BasePathContext`** — absolute-URL resolution under subdirectory deployments. Same location, same promote-on-third-use story.
- **Asset fetching** — docx has `fetchImageData` in `src/adapters/docx.js`. Typst doesn't need it (images referenced by URL, compiler resolves at compile time). Paged.js doesn't need it (browser resolves). When the next HTML-based adapter that *does* need embedded assets lands — EPUB is the likely candidate — the shared extraction to `src/assets/` happens.

The promote-on-second-use rule is load-bearing. If you find yourself wanting to pre-extract a utility "because another adapter will probably need it," don't — the second adapter will tell you what the API should be, and guessing wrong is more expensive than moving the code later.

## See also

- [principles.md](./principles.md) — the commitments this doc operationalizes.
- [overview.md](./overview.md) — the broader architecture your adapter slots into.
- [format-roadmap.md](./format-roadmap.md) — what's shipped, what's likely next.
- [deployment.md](./deployment.md) — if your format needs a backend, the wire protocol and reference implementations live here.

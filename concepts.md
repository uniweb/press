# Press concepts

A mental model for using Press. If you're writing a Uniweb foundation and want to understand how to think about downloadable output, this is the doc. It's about ideas, not API — for the hello-world walkthrough see the [quick start](./quick-start.md); for the commitments that shape Press's design see [principles.md](./architecture/principles.md).

## The problem Press solves

A Uniweb site is, in a useful sense, a URL that represents a document. Titles, paragraphs, tables, lists, tagged data blocks — all already parsed by the Uniweb runtime, all already available to section components as `{ content, block }`. With Loom and dynamic data fetching, that document can be live and hierarchical: a report whose sections instantiate against a CV profile, a publication list that updates automatically, a program whose entries are filtered per department.

The content is right there. The question is: can the same content exist as a downloadable file — a Word document, a spreadsheet, a PDF book, whatever the foundation wants to support — without maintaining two separate pipelines?

Press's answer is yes, and the mechanism is small. Section components opt into a format by registering a *fragment*; Press walks the registrations at compile time; an adapter turns them into a `Blob`. One source, many outputs.

## The registration pattern

At the core of Press is a single pattern. Inside a section component's render, you call:

```jsx
useDocumentOutput(block, 'docx', fragment)
```

This says: *for this block, when someone compiles a docx, include this fragment.* The call is synchronous during render, the hook is a no-op when called outside a `DocumentProvider`, and it's idempotent — calling it twice with the same block and format just overwrites. Strict Mode's double-render is fine.

Three consequences follow from this shape:

**Opting in is per-section.** A section component that doesn't call `useDocumentOutput` never contributes to a compiled document. You can freely mix opt-in sections with ordinary rendering-only sections in the same page, and the Download button will produce a document containing only the opt-in ones.

**Registration is decoupled from rendering.** A section component can return `null` from its render and still register a fragment. This is the foundation of headless export — a site that has no visible output, existing purely as a compile target. Useful for admin tools, generator UIs, and automated pipelines.

**The fragment is format-specific.** What you register depends on the format. For docx and typst, it's JSX using the `/docx` or `/typst` builder components. For xlsx, it's a plain object like `{ title, headers, data }`. Each format's builders know what their adapter expects.

## Fragments

A fragment is whatever the adapter for that format needs as input. There's no shared shape across formats, by design — spreadsheets aren't typography, and forcing them into a common structure produces something that serves neither well.

The two canonical shapes are:

**JSX emitting semantic HTML** (docx, typst, future Paged.js). The builders in `@uniweb/press/docx` and `@uniweb/press/typst` produce ordinary HTML elements with `data-*` attributes. Press walks that HTML at compile time and turns it into format-native output. Because the output is plain HTML, the same JSX that registers the fragment can also render as the browser preview — one tree, zero drift.

**Plain JavaScript objects** (xlsx, custom data exports). The fragment is whatever shape the adapter defines. For xlsx: `{ title, headers, data }`. For a custom JSON export adapter: whatever you decide. The adapter reads the objects directly without any HTML or IR in between.

Which shape you use is determined by the format, not by your preference. You pick a format; the format's builders tell you what fragments look like.

## Compile is separate from download

Press splits two operations most libraries combine:

- `useDocumentCompile().compile(format)` produces a `Blob`. It doesn't save anything.
- `triggerDownload(blob, filename)` saves a Blob to disk using a standard browser download.

This split is deliberate and occasionally surprising. The reason is that a Blob isn't only useful as a download target. You might want to:

- Render it back into the page for a high-fidelity preview (e.g., feeding a `.docx` Blob into `docx-preview` inside an iframe to see Word's actual formatting).
- Upload it somewhere instead of downloading it.
- Hash it for caching.
- Display a "ready" indicator without actually saving until the user clicks.

Once Press returns a Blob, it's yours. Triggering a download is a one-liner if that's what you want, but Press doesn't assume it.

## How preview works

If your foundation renders a web page *and* offers a download, you have a decision to make about how the on-screen preview relates to the compiled output. Two strategies, and they compose.

### Same-source preview

The JSX you register is also the JSX you render. The `/docx` and `/typst` builders emit semantic HTML (`<p>`, `<h1>`, `<span>` with `data-*` attributes), which means the same tree can:

1. Register as the fragment via `useDocumentOutput`.
2. Render to the page as ordinary HTML.

There's no duplication to drift between preview and output. A heading you see on screen is the same heading the compile pipeline walks. This is the recommended strategy for document-shaped formats; it's what makes Press feel coherent for reports and books.

You can also split: use Kit components (`<H1>`, `<Prose>`, etc.) for a richer themed preview, and Press builders for the registered fragment, mirroring the same structure by hand. More work, more visual polish, same zero-drift guarantee if you keep the structures parallel.

### Compiled-blob preview

Instead of previewing the *content*, preview the *compiled file*. Render whatever you want (or nothing) in the component, then feed the Blob from `compile('docx')` into a preview library like [`docx-preview`](https://github.com/VolodymyrBaydalka/docxjs) inside a sandboxed iframe. You see Word's actual formatting — pagination, headers, footers, style resolution — not a web approximation.

This pays a library cost (`docx-preview` is another dependency) and won't update as quickly as same-source preview, but it's the right choice when the downloaded file's exact appearance matters more than browseability. It's also the right choice for formats where same-source preview is awkward or impossible — xlsx sheets, for instance, or future slide decks.

### Compose them

Nothing prevents using both. A common pattern for foundations that care about both reading and fidelity:

- Normal reading uses same-source preview (what the user sees while browsing).
- A "preview compiled file" button opens a modal with the docx-preview iframe as a cross-check view.

The [preview-iframe example](../examples/preview-iframe/) in the repo demonstrates the compiled-blob pattern end to end.

## How you use Press

Press doesn't prescribe what the site is *for*. Three shapes are all first-class, and the choice depends on what you're building.

### Interactive report with downloads

A live web document — navigable, themed, possibly with dynamic data and Loom-instantiated content — that also offers one or more Download buttons. Readers browse on screen; those who need a file click Download.

This is the flagship case: annual reports, CVs, program guides, research publications, and anything else that wants to exist as both a URL and a document. Typically uses same-source preview, so what the reader sees on screen is exactly what they get in the file.

### Multi-format exports

One site, several formats. A report foundation might register docx fragments for the narrative, xlsx fragments for the tabular data, and a custom JSON export for machine consumers — all on the same page, from the same content.

Each section chooses which formats it contributes to. A cover section might register for docx only; a data section might register for xlsx only; a discussion section might register for both. Compilation is per-format and lazy: the xlsx adapter loads only when someone clicks "Download xlsx," and only the sections that registered for xlsx are included.

### Headless export

Sections register fragments and return `null`. The site has no visible output — it exists purely as a compile target for an automated pipeline, an admin tool, or a generator UI whose only job is to produce files.

Press works here because registration is decoupled from rendering. A component that returns `null` still contributes to `compile()`. Useful when the foundation isn't the product — the files it generates are.

## Books and whole-site compilation

The three shapes above all live inside a single page: one URL, one Download button, the registrations belong to that page. This covers most use cases.

Books are different. A book has one URL per chapter, one chapter per render, and a Download button whose scope is *all chapters*. The compile can't just read the current page's registrations — it needs to walk every page's content, gather every registration, and produce one document.

Press's answer is `compileSubtree`. You hand it a React subtree — typically `<ChildBlocks blocks={website.allBlocks} />` which pulls every block from every page — and it renders the subtree off-screen through its own provider, gathers all registrations, and compiles. No page routing, no DOM mounts. Uniweb's object graph is already populated in memory; walking it is free.

This is the mechanism behind Typst book compilation, and it's how any future "whole-site export" format will work. For a full treatment, see the [book publishing guide](./guides/book-publishing.md).

## What Press doesn't do

Four things Press deliberately leaves to upstream or to the foundation:

**Content parsing.** Markdown → ProseMirror → `@uniweb/semantic-parser` → `{ content, block }` is the Uniweb runtime's job. Press consumes whatever shape the runtime has already produced. If you want to use Press outside Uniweb, produce that shape yourself — `StandardSection` duck-types on the content shape, so non-Uniweb projects that match the shape get it for free.

**Data fetching and template expansion.** Loom expressions, block-level fetch configs, and `EntityStore` all run before Press. A chapter that interpolates live data looks identical to a static chapter from Press's point of view — by the time Press sees `content.paragraphs[0]`, any `{{placeholders}}` have already been resolved.

**Routing.** Pages, navigation, active-route highlighting — foundation and runtime concerns. `compileSubtree` works regardless of the active route; Press never interacts with the router.

**Production server infrastructure.** Press ships a Vite dev plugin for local Typst compilation because it's a two-line install, but production deployment of a compile endpoint is the foundation's responsibility. The wire protocol is tiny and deployment is highly platform-specific. See [deployment.md](./architecture/deployment.md) if you're running a format that needs a backend.

## See also

- [Quick start](./quick-start.md) — ten minutes from install to a working Download button.
- [Writing a custom adapter](./guides/custom-adapter.md) — build a new format that isn't one of the shipped ones.
- [Publishing a book](./guides/book-publishing.md) — whole-site aggregation, the Typst pipeline, compile modes.
- [The preview pattern](./guides/preview-pattern.md) — using `docx-preview` for compiled-blob preview.
- [principles.md](./architecture/principles.md) — the commitments behind the design.
- [overview.md](./architecture/overview.md) — how Press is put together under the hood.

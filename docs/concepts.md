# Concepts

The architectural ideas that shape Press. Read this if you want to understand *why* the library looks the way it does, not just how to use it.

## The problem: two representations that drift

A foundation that generates downloadable documents typically maintains two versions of each section:

- **Preview** — HTML/CSS that renders in the browser so users can see the document before clicking Download.
- **File** — an imperative builder (`new Paragraph({...})`, `doc.addSection(...)`) that produces the actual `.docx` or `.xlsx`.

These two diverge. A tweak to the preview's heading size doesn't land in the file version until someone remembers to edit the other code path. Tests cover one but not the other. Users report "the file looks different from what I saw on screen."

Press exists to eliminate the second representation. There is **one** React tree, written with a small library of **builder components**, and it is *both* the preview and the source of truth for the downloaded file.

## JSX as source of truth

A builder component like `<Paragraph>` or `<H1>` emits ordinary JSX — a `<p>` or `<h1>` element with `data-*` attributes that encode format-specific concerns (borders, spacing, heading level, image transforms, hyperlinks). When React renders it into the DOM, the user sees a paragraph or a heading. When Press compiles it to a docx file, the exact same JSX is rendered to static HTML, walked into an intermediate representation (IR), and handed to the format adapter.

```jsx
<Paragraph data="Awarded in <strong>2004</strong> with <em>honors</em>." />
```

- **In the browser:** a `<p>` with inline `<span>`s for the bold and italic runs.
- **In the compiled file:** a docx `Paragraph` with three `TextRun` children (plain, bold, plain, italic, plain).

Same JSX, two consumers. No drift, because there is nothing to drift from.

## The registration pattern

Press doesn't enumerate sections. It doesn't ask you to pass a list of documents to render. Section components opt in from inside their own render functions through a hook:

```jsx
function Cover({ block, content }) {
    const markup = (
        <>
            <H1 data={content.title} />
            <Paragraph data={content.body} />
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
}
```

The hook stores `markup` in a `WeakMap<block, Map<format, entry>>` held by the enclosing `<DocumentProvider>`. When compilation runs, the provider's store is walked in registration order and every entry for the requested format is compiled.

This has several consequences:

- **Components are agnostic.** A section doesn't know whether its surrounding page is rendering a preview, compiling a document, both, or neither. It just renders, and registration is a side effect of rendering.
- **Concurrent-React-safe.** The registration is idempotent — calling `register(block, format, markup)` twice with the same `markup` produces the same result. Strict Mode's intentional double-render is harmless.
- **Garbage-collected.** Because the store is a `WeakMap` keyed by `block`, when a section unmounts and its block is no longer referenced, the registration becomes eligible for GC. No manual cleanup.
- **Composable.** Adding a second format (xlsx, pdf, markdown) is a matter of registering under a different format key. The registration machinery is the same.

## Compile is separate from download

`useDocumentCompile` returns a function that produces a Blob:

```js
const { compile, isCompiling } = useDocumentCompile()
const blob = await compile('docx', { title: 'Annual Report' })
```

`triggerDownload` is a separate exported utility that turns a Blob into a browser download:

```js
triggerDownload(blob, 'annual-report.docx')
```

These are not combined. The split exists because one of the most useful things you can do with a compiled Blob is render it somewhere — a sandboxed iframe, a `<div>`, a preview pane — *without* saving a file. The [preview pattern guide](./guides/preview-pattern.md) walks through that use case in detail. If `compile` automatically downloaded, a "preview" button would have to compile *twice*: once to render into the iframe, once to download when the user clicks the Download button.

## Lazy-loaded adapters

The `docx` library is ~3.4 MB unminified — a significant cost to pay for users who never click Download. Press never pulls it into the main bundle. The format adapter at `src/adapters/docx.js` is reached *only* through a dynamic import inside `useDocumentCompile`:

```js
// src/useDocumentCompile.js
const ADAPTERS = {
    docx: () => import('./adapters/docx.js'),
    // xlsx: () => import('./adapters/xlsx.js'),
}
```

When the user first clicks Download, the bundler emits a separate chunk for the adapter and the browser fetches it on demand. Until then, a page using Press pays only for the registration machinery (small, mostly React context) and the builder components (also small — plain JSX wrappers around `data-*` attributes).

The adapter path is deliberately *not* listed in `package.json`'s `exports` field. Consumers that try to reach for it directly (`import { compileDocx } from '@uniweb/press/adapters/docx.js'`) won't find it, which keeps the lazy-load contract enforceable.

## Three output shapes, one registration interface

Press supports multiple output formats, but it does **not** force them through a shared intermediate representation. Different document formats need different shapes:

| Format | What a section registers |
|---|---|
| **docx** | JSX with `data-*` attributes. Compiled via `renderToStaticMarkup` → `htmlToIR` → `compileDocx`. |
| **xlsx** *(planned)* | A plain `{ title, headers, data }` object. No IR conversion — xlsx doesn't have paragraphs and text runs. |
| **pdf** *(planned)* | Either the same JSX as docx (via Paged.js) or `@react-pdf/renderer` primitives for fine control. |

The docx case is the only one that uses the IR walker. The xlsx case collects registered objects as-is. The registration interface (`useDocumentOutput(block, format, fragment)`) is identical for all three — only the **shape of `fragment`** varies per format, because the format itself varies. Trying to force a single IR across all of them would make the docx case leak spreadsheet concerns and the xlsx case leak typographic ones.

This is why Press's core is format-agnostic (the provider and hook) and its format-specific code lives at dedicated subpaths (`/docx`, and later `/xlsx`, `/pdf`).

## The four layers

The package is organized into four layers, from foundational to optional:

1. **`@uniweb/press` (root)** — format-agnostic core. The provider, the registration hook, the compile hook, the download utility. This is always needed.
2. **`@uniweb/press/docx`** — React builder components. Foundations use these to describe document content. Bundled into the foundation's chunk; the docx library itself is *not*.
3. **`@uniweb/press/sections`** — higher-level templates (`Section`, `StandardSection`) that remove the register-and-render boilerplate. Optional sugar — you can skip it.
4. **`@uniweb/press/ir`** — the IR layer, exposed for authors writing their own format adapters. Not needed by typical foundation code.

See each API reference (linked from the [README](../README.md)) for details.

## What Press deliberately doesn't do

- **Server-side document generation.** Press runs entirely in the browser. No backend, no file upload, no render queue. If you need to generate documents on the server, Press is not the right library.
- **Template-engine / placeholder resolution.** Section components assume the content they receive is already fully resolved. Dynamic values like `{family_name}` are handled by an upstream layer (a Uniweb foundation's content handler, typically powered by [`@uniweb/loom`](https://github.com/uniweb/loom)). Press stays format-focused.
- **Citation formatting.** Bibliographies need structured output (`{ text, html, parts }`) that depend on author count, date presence, container type, etc. That's not a template problem. Foundations that need citations import `@citestyle/*` directly and use it at the component level — see the [citations guide](./guides/citations.md).
- **Cross-foundation theme configuration.** A `theme.yml`-equivalent for documents is interesting future work but deliberately not in Press's scope.

These omissions are how Press keeps its surface small.

# Concepts

The architectural ideas that shape Press. Read this if you want to understand *why* the library looks the way it does, not just how to use it.

## The insight

A Uniweb site is already pure content. Markdown files, parsed into a guaranteed shape, delivered to React components as `{ content, params, block }`. That content doesn't only belong on screens. The same titles, paragraphs, tables, lists, and data blocks that render an "About" page can power an annual report, a conference program, a data export, a print-ready brochure, or anything else a user might want to download.

A Uniweb site is, in a useful sense, a URL that represents a document — and with Loom expressions and the framework's dynamic data fetching, that document can be hierarchical, live, and per-section computed. Press's job is to give foundations the infrastructure to turn all of that into downloadable files without reimplementing content parsing, data fetching, or the React component system.

## Press is a framework, not a docx library

The core of Press is format-agnostic:

- **`DocumentProvider`** holds registrations.
- **`useDocumentOutput(block, format, fragment)`** lets a section component say "here is what I produce for this format."
- **`useDocumentCompile()`** compiles all registrations for a given format into a Blob.
- **`triggerDownload(blob, fileName)`** is a DOM utility.

None of these primitives know what `'docx'` means. The `format` argument is an arbitrary string, and the `fragment` can be any shape — JSX, a plain data object, a template string, whatever makes sense for the format you're producing.

Press **ships** a docx toolkit (`@uniweb/press/docx` — React builder components — plus an internal format adapter reached via dynamic import) because docx is the most requested format for reporting use cases. xlsx and pdf toolkits are on the roadmap as additional conveniences. But those are **extras**, not the point. Press is a framework for generating any output format from Uniweb content; the docx toolkit is one implementation of that framework.

If you need a format Press doesn't ship — Markdown, RTF, a custom JSON export, a specialized XML — you can write your own adapter today against `@uniweb/press/ir`, register fragments in whatever shape that format needs, and compile them through the same hook and provider. See [Writing a custom adapter](./guides/custom-adapter.md).

## Static content, dynamic documents

A plain Uniweb site already gives you static content that can power downloadable files — a curriculum, a menu, a set of meeting minutes. That's useful on its own.

The interesting case is **dynamic documents**. Foundations can combine Press with:

- **Loom expressions in markdown** — `{first_name}`, `{SHOW grants.amount SORTED BY year DESCENDING}`, `{TOTAL OF grants.amount AS currency USD}`. Content authors write natural-language templates; the framework resolves them against whatever data the foundation fetched.
- **Dynamic data fetching** — each section can declare a data source (a CV profile, an API endpoint, a collection of entities), and the framework delivers the resolved data as `content.data` or through `EntityStore`.
- **Foundation content handlers** — a foundation can declare a lifecycle hook that runs before semantic parsing, instantiate Loom expressions against live data, and return fully-resolved content. Section components see no placeholders; they just render what they're given.

Put together, these let a single foundation generate reports that look identical in structure but vary by content, data, and time — a per-faculty CV, a per-department annual report, a quarterly publication list that updates automatically. The section component doesn't know whether the content is static or dynamically instantiated; it just receives the standard content shape and builds a docx (or xlsx, or anything else) from it.

Press is the output layer of that system. It doesn't fetch data, it doesn't run Loom, it doesn't resolve placeholders — those are upstream concerns handled by the Uniweb runtime. Press only asks: "given a React tree that already renders the content you want, how do I turn it into a downloadable file?"

## The registration pattern

Section components opt into document generation from inside their own render functions, through a hook:

```jsx
import { useDocumentOutput } from '@uniweb/press'
import { H1, H2, Paragraphs } from '@uniweb/press/docx'

function Cover({ content, block }) {
    const { title, subtitle, paragraphs } = content

    const body = (
        <>
            <H1 data={title} />
            <H2 data={subtitle} />
            <Paragraphs data={paragraphs} />
        </>
    )

    useDocumentOutput(block, 'docx', body)

    return <div className="max-w-4xl mx-auto">{body}</div>
}

export default Cover
```

A few things to notice:

- **Standard Uniweb shape.** The component takes `{ content, block }`. `content.paragraphs` is an array of strings (empty if there are none — never null). There is no `<section>` wrapper because the Uniweb runtime wraps every section in `<section>` with the right context class and background. The component returns just its inner content.
- **Registration is a side effect of render.** When this component is rendered inside a `<DocumentProvider>`, the hook stores `body` in a `WeakMap<block, Map<format, entry>>`. When compilation runs, the provider walks its store in registration order and compiles each entry.
- **The block is the key.** `block` identifies the section uniquely. When a section unmounts and its block is no longer referenced, the registration becomes eligible for GC.
- **Concurrent-React-safe.** Registration is idempotent — calling `register(block, format, markup)` twice with the same block+format overwrites the first entry. Strict Mode's intentional double-render is harmless.

The hook is a no-op with a development warning when called outside a `<DocumentProvider>`, so sections are safe to mount in trees where the provider is conditional. A section that doesn't care about document generation simply never calls the hook.

## Four ways to combine preview and registration

Once you have a registration hook, you can choose how much of the visible React tree to share with the compiled output. Four modes are all valid:

### Mode 1 — same JSX serves both

The simplest and most elegant case. Press's `/docx` builder components emit ordinary HTML (`<p>`, `<h1>`, `<span>` with `data-*` attributes), so the exact same JSX works as the browser preview *and* as the source walked by the compile pipeline.

```jsx
function Cover({ content, block }) {
    const { title, subtitle, paragraphs } = content

    const body = (
        <>
            <H1 data={title} />
            <H2 data={subtitle} />
            <Paragraphs data={paragraphs} />
        </>
    )

    useDocumentOutput(block, 'docx', body)
    return body
}
```

One source of truth. Zero drift. If you edit the heading, it changes in both places because there is no "both places" — there's one tree. This is the case Press is optimized for.

### Mode 2 — separate preview, shared structure

You want a richer preview than Press's builders provide — Kit's theme-aware typography, component-level design variations, animations — while still compiling to docx from the same component.

```jsx
import { useDocumentOutput } from '@uniweb/press'
import * as Docx from '@uniweb/press/docx'
import { H1, H2, P } from '@uniweb/kit'

function Cover({ content, block }) {
    const { title, subtitle, paragraphs } = content

    // Register the docx version — plain Press builders.
    useDocumentOutput(block, 'docx', (
        <>
            <Docx.H1 data={title} />
            <Docx.H2 data={subtitle} />
            <Docx.Paragraphs data={paragraphs} />
        </>
    ))

    // Render the preview with Kit — richer typography, adapts to
    // the site's theme context automatically.
    return (
        <div className="max-w-4xl mx-auto">
            <H1 text={title} className="text-heading text-5xl font-bold" />
            <H2 text={subtitle} className="text-subtle text-2xl mt-4" />
            <P text={paragraphs} className="text-body mt-6" />
        </div>
    )
}
```

The structure mirrors (heading, subtitle, paragraphs), but the typography layer is different: Kit for the visible preview, Press builders for the file. This is the most common mode for Uniweb foundations that already use Kit for visible rendering.

### Mode 3 — different shapes per medium

Sometimes the preview and the downloaded file are fundamentally different. An interactive chart with tooltips and filters in the preview; a flat table of numbers in the downloadable xlsx. A summary view for the web; a full-detail report for the file. You register one shape, render another.

```jsx
import { useDocumentOutput } from '@uniweb/press'
import { Chart } from '@uniweb/kit' // hypothetical chart component

function PublicationStats({ content, block }) {
    const { data } = content
    const rows = aggregateByYear(data.publications || [])

    // xlsx: flat tabular data, one sheet per block
    useDocumentOutput(block, 'xlsx', {
        title: 'Publications by year',
        headers: ['Year', 'Count', 'Refereed'],
        data: rows.map((r) => [r.year, r.total, r.refereed]),
    })

    // Preview: an animated chart with filters
    return (
        <Chart
            type="bar"
            data={rows}
            x="year"
            y={['total', 'refereed']}
            animated
        />
    )
}
```

The preview uses the same data but presents it as a visualization. The xlsx uses the same data but presents it as rows. Two renderings, one source, each optimized for its medium.

This is the mode the legacy report-sdk's `Publications/Charts` component arrived at years ago, and it's the reason Press doesn't try to force a single IR across all formats. Spreadsheets aren't typography; charts aren't tables. The registration interface is what unifies them, not the data shape.

### Mode 4 — document-only, no visible preview

If a component exists only to contribute to the compiled document — a hidden header metadata block, a cover-letter footer, a computed appendix — it can register and return `null`. No preview at all.

```jsx
function FooterMeta({ content, block }) {
    useDocumentOutput(block, 'docx', (
        <Paragraph>
            Generated {new Date().toISOString().slice(0, 10)}. Page <TextRun>_currentPage</TextRun> of <TextRun>_totalPages</TextRun>.
        </Paragraph>
    ), { role: 'footer' })

    return null
}
```

Or register inside an existing component whose visible output is unrelated to what goes into the file. Press doesn't care what your component renders; it only cares what you registered.

### Why you'd choose Mode 1 or 2 over a plain docx-preview

If Press is a framework for *compiling* JSX into docx, and docx files can be previewed with the [`docx-preview`](https://github.com/VolodymyrBaydalka/docxjs) library, why render anything in the component at all? Why not just compile and hand the Blob to docx-preview?

Three reasons.

1. **You already have a React preview for free.** Your component is rendering JSX anyway — that's what React components do. Using Press builders as the preview is zero extra cost: no second library to install, no second render pass, no loading `docx-preview` on page load. The preview IS the React render. docx-preview is only useful if you want to preview the *compiled output* (which will have Word's own formatting quirks). For previewing the *content*, the React render is better.
2. **You can enhance the preview with interactivity.** Tooltips, action buttons, inline help, hover states, expand-to-show-detail, "copy this section" menus — anything that belongs in a live web view and has no place in a flat document. The preview isn't constrained to look like the file; it can be the best web representation of the content, while the downloaded file is the best flat representation.
3. **You can choose different visualizations per medium.** Nivo chart in the preview, flat table in the xlsx. Interactive collapsible tree in the preview, pre-expanded sections in the docx. Large illustrated figures in the preview, tight margins and small figures in the print file. Same underlying content, optimized rendering for each medium.

If none of these apply, Mode 4 (register and return null) is the right answer — there's no value in forcing a preview that's only there to be compiled. Press's design does not require a visible preview; it enables one when you want it.

## Compile is separate from download

`useDocumentCompile()` returns a function that produces a Blob:

```js
const { compile, isCompiling } = useDocumentCompile()
const blob = await compile('docx', { title: 'Annual Report' })
```

`triggerDownload` is a separate exported utility:

```js
triggerDownload(blob, 'annual-report.docx')
```

These are **not** combined. The split exists because one of the most useful things you can do with a compiled Blob is render it somewhere — a sandboxed iframe via `docx-preview` for a cross-check view, a PDF preview pane, a backend upload, a Web Worker for further processing — *without* saving a file. See [the preview pattern guide](./guides/preview-pattern.md) for the cross-check-via-docx-preview flow, which is different from the per-component preview discussed above.

If `compile` automatically downloaded, any "compile and show me" workflow would either double-compile or work around the auto-download. Keeping them separate makes Press composable with any Blob-consuming library.

## Lazy-loaded adapters

The `docx` library is ~3.4 MB unminified — a significant cost to pay for users who never click Download. Press never pulls it into the main bundle. The format adapter at `src/adapters/docx.js` is reached *only* through a dynamic import inside `useDocumentCompile`:

```js
const ADAPTERS = {
    docx: () => import('./adapters/docx.js'),
    // xlsx: () => import('./adapters/xlsx.js'),
}
```

The first time `compile('docx')` runs, the bundler emits a separate chunk for the adapter and the browser fetches it on demand. Until then, a page using Press pays only for the registration machinery (small, mostly React context) and whatever builder components you've imported (also small — plain JSX wrappers around `data-*` attributes, with no dependency on the `docx` library).

The adapter path is deliberately *not* listed in `package.json`'s `exports` field. Consumers can't reach for it directly, which keeps the lazy-load contract enforceable. When Press eventually ships xlsx and pdf toolkits, they will follow the same pattern: a public `/xlsx` or `/pdf` subpath for React builders (small), plus an internal adapter reached via dynamic import (large).

Custom adapters written by users of Press can follow the same convention or not — the lazy-load story is a Press-internal contract about how *shipped* adapters stay out of the main bundle. If your custom format's dependencies are small, static imports are fine.

## Three output shapes Press ships (or will ship)

| Format | What a section registers | Preview relationship |
|---|---|---|
| **docx** (shipped) | JSX with `data-*` attributes. Walked via `renderToStaticMarkup` → `htmlToIR` → `compileDocx`. | Often the same JSX, or Kit-powered preview mirroring the structure. |
| **xlsx** (roadmap) | A plain `{ title, headers, data }` object. No IR conversion. | Usually different — a chart or interactive table in the preview, flat rows in the sheet. |
| **pdf** (roadmap) | Either docx JSX (via Paged.js) or `@react-pdf/renderer` primitives. | Usually the same as docx for the Paged.js path. |

These are the toolkits Press will ship to make the common cases frictionless. They are **not** a fundamental architectural constraint. Press's registration interface (`useDocumentOutput(block, format, fragment)`) is identical for all formats and for any future format you write an adapter for. The only thing that differs across formats is the shape of `fragment`, because the formats themselves differ — and Press deliberately doesn't force a single IR across them.

## The four layers

The package is organized into four layers, from foundational to optional:

1. **`@uniweb/press` (root)** — format-agnostic core. The provider, the registration hook, the compile hook, the download utility. This is always needed.
2. **`@uniweb/press/docx`** — React builder components for docx. Bundled into the foundation's chunk; the docx library itself is *not*.
3. **`@uniweb/press/sections`** — higher-level templates (`Section`, `StandardSection`) that remove register-and-render boilerplate. Optional sugar, primarily useful in non-Uniweb React contexts where the runtime isn't providing a section wrapper for you. Uniweb foundations usually skip this subpath and register directly via `useDocumentOutput`.
4. **`@uniweb/press/ir`** — the IR layer, exposed for authors writing their own format adapters. Not needed by typical foundation code.

See each API reference (linked from the [README](../README.md)) for details.

## What Press deliberately doesn't do

- **Server-side document generation.** Press runs entirely in the browser. No backend, no file upload, no render queue. If you need to generate documents on the server, Press is not the right library.
- **Template-engine / placeholder resolution.** Section components assume the content they receive is already fully resolved. Dynamic values like `{family_name}` or `{SHOW grants.amount SORTED BY year DESCENDING}` are handled upstream — typically by a Uniweb foundation's content handler, powered by [`@uniweb/loom`](https://github.com/uniweb/loom). Press stays format-focused.
- **Citation formatting.** Bibliographies need structured output (`{ text, html, parts }`) that depend on author count, date presence, container type, etc. That's not a template problem. Foundations that need citations import `@citestyle/*` directly and use it at the component level — see the [citations guide](./guides/citations.md).
- **Data fetching.** Uniweb has `EntityStore` and block-level fetch configs for that. Press consumes whatever `content.data` the runtime has already resolved.
- **A `theme.yml`-equivalent for documents.** Cross-foundation document theme configuration is interesting future work but deliberately not in Press's scope. Foundations control their own typography via the `data-*` attributes on Press builders.

These omissions are how Press keeps its surface small — a registration layer, a compile pipeline, a download utility, and a shipped docx toolkit for convenience. Everything else is either upstream of Press (in the Uniweb runtime) or layered on top of it (at the foundation level).

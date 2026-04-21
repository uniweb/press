# Publishing a book

A book is a multi-chapter Uniweb site that downloads as a single PDF. The web version is a reading experience of your choosing; the PDF is a proper typeset print artifact, compiled by [Typst](https://typst.app). The two artifacts share one source of content — markdown files, parsed to the standard `{ content, block }` shape — but neither is the other's preview.

This guide assumes you've worked through [Quick start](../quick-start.md) and [Concepts](../concepts.md). The [docusite pattern](./docusite.md) covers the related but different case where the web page *is* literally what the download looks like, compiled as `.docx`. Reach for this guide when the book is large enough (multiple chapters) that a web reader wants navigation, progress, and UX that a PDF doesn't need.

## What Press gives you, for books

The per-page compile primitive (`useDocumentCompile`) isn't enough. A book's Download button needs to aggregate every chapter, including chapters that aren't currently mounted in the live DOM. Press exports a matching primitive for that:

```js
import { compileSubtree } from '@uniweb/press'

const blob = await compileSubtree(
  <ChildBlocks blocks={allBookBlocks} />,
  'typst',
  {
    basePath: website.basePath,
    adapterOptions: { mode: 'server', meta, preamble, template },
  },
)
```

`compileSubtree` renders any React tree — including trees built from pages that aren't the active route — through a throwaway `DocumentProvider`, collects every registration, dispatches the Typst adapter, and returns the PDF Blob. The tree is rendered off-screen via `renderToStaticMarkup`, so nothing mounts in the live DOM and the active route is untouched.

See the end of this guide for the implementation sketch of a whole-book Download button.

## Two web modalities

Once downloads are decoupled from the active page, the web version has no particular shape it needs to take. Two shapes are both first-class:

### Mode 1 — the web page IS the preview

The simplest case. Your chapter component renders Press's `/typst` builders directly, and the same JSX serves as the web view.

```jsx
import { useDocumentOutput } from '@uniweb/press'
import { ChapterOpener, Sequence } from '@uniweb/press/typst'

function Chapter({ content, block }) {
  const body = (
    <>
      <ChapterOpener title={content.title} />
      <Sequence data={content.sequence} />
    </>
  )
  useDocumentOutput(block, 'typst', body)
  return body
}
```

Zero drift between the web reader and the PDF, because there is no "web reader" separate from the fragment — it's the same tree twice. Press's `Sequence` walker emits plain HTML (`<h2>`, `<p>`, `<pre>` with `data-*` attributes); the compile pipeline reads those attributes to emit Typst. Good for straightforward books where you want the web page to look close to the printed page.

### Mode 3 — the web is its own medium

When the book is long enough that reading on screen deserves dedicated UX — sidebar navigation, expand/collapse chapter sections, auto-numbered chapter labels, mobile drawer, scroll restoration — the web view becomes a standalone design and the PDF becomes a separate artifact from the same content. The chapter component renders rich web JSX for the preview *and additionally* registers a Typst fragment.

```jsx
import { Render } from '@uniweb/kit'
import { useDocumentOutput } from '@uniweb/press'
import { ChapterOpener, Sequence } from '@uniweb/press/typst'

function BookPage({ content, block }) {
  // Web side: Kit's <Render> walks the raw ProseMirror doc so the
  // reader sees the full fidelity (images, tagged data blocks, insets,
  // hover states, interactivity).
  const nodes = block.rawContent?.content

  // Download side: register a Typst fragment. Independent of the web
  // view — the PDF layout isn't constrained by what looks good on
  // screen, and vice versa.
  useDocumentOutput(
    block,
    'typst',
    <>
      <ChapterOpener title={content.title} />
      <Sequence data={content.sequence} />
    </>,
  )

  return (
    <article className="book-prose">
      <Render content={nodes} block={block} />
    </article>
  )
}
```

The web tree and the registered Typst tree are two different things from the same content. Either can change without affecting the other — this is Press's Mode 3 applied at the book level.

## Three compile modes

Press ships three compile modes for Typst. Pick per-button.

### `sources` — ZIP of a Typst project

```js
const blob = await compileSubtree(tree, 'typst', {
  adapterOptions: { mode: 'sources', meta, preamble, template },
})
```

Returns a `application/zip` Blob containing `main.typ`, `meta.typ`, `content.typ`, `preamble.typ`, and `template.typ`. No server needed; no Typst binary. The user unzips, runs `typst compile main.typ`, and gets the PDF. This is the right mode for:

- Power users who want a Typst project they can hand-edit.
- Environments without a compile endpoint.
- Deployments that want an always-available fallback alongside the PDF button.

`jszip` is the only runtime dependency — already pinned as a Press dependency.

### `server` — one-click PDF

```js
const blob = await compileSubtree(tree, 'typst', {
  adapterOptions: {
    mode: 'server',
    meta,
    preamble,
    template,
    endpoint: '/__press/typst/compile',  // default
  },
})
```

POSTs the same 5-file bundle to an endpoint as `multipart/form-data`, one field per file keyed by filename. The endpoint runs `typst compile main.typ`, returns the PDF. `compileSubtree` returns the response as `application/pdf`. One click, no unzip step.

The endpoint is the interesting piece; see the [Vite dev plugin](#the-vite-dev-plugin) and [production endpoints](#production-endpoints) sections.

### `wasm` — browser-side compile (roadmap)

`@myriaddreamin/typst.ts` currently emits SVG/vector artifacts rather than PDF bytes. As soon as a WASM runtime ships PDF export (or we layer SVG→PDF on top), Press will add `mode: 'wasm'` so downloads work with no server at all. Until then: `sources` everywhere, `server` where you have an endpoint.

## The Vite dev plugin

Press ships a Vite plugin that answers the `server` mode's POST. Add it to your site's `vite.config.js`:

```js
import { defineSiteConfig } from '@uniweb/build/site'
import { pressTypstCompile } from '@uniweb/press/vite-plugin-typst'

export default defineSiteConfig({
  plugins: [pressTypstCompile()],
})
```

That's it. The plugin is `apply: 'serve'`, so it's dev-only. It mounts a middleware at `/__press/typst/compile` that:

1. Parses the incoming multipart bundle.
2. Writes the files into a fresh temp directory.
3. Spawns `typst compile main.typ out.pdf`.
4. Streams the PDF back as `application/pdf`.
5. Cleans up the temp directory.

**Requirements:** the `typst` binary must be available in `PATH`. Install Typst (`brew install typst`, etc.) or add the [`typst` npm package](https://www.npmjs.com/package/typst) to your project's devDependencies so the binary lands in `node_modules/.bin`. If the binary is missing, the plugin returns a 500 with a helpful install message.

**Options:**

```js
pressTypstCompile({
  path: '/__press/typst/compile',      // override the route
  binary: 'typst',                      // custom binary path
  extraArgs: ['--font-path', '/fonts'], // passed to `typst compile`
})
```

## Production endpoints

The dev plugin is dev-only. Production deployments need their own endpoint that speaks the same wire protocol: POST multipart/form-data with one field per bundle file, respond with `application/pdf`. That's a ~20-line handler:

```js
// Cloudflare Worker (sketch)
export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('Use POST', { status: 405 })
    const form = await req.formData()
    // Write files to a tmp dir, run Typst (via @myriaddreamin/typst.ts
    // or a sidecar container), read PDF, return it.
  }
}
```

```js
// Express (sketch)
app.post('/compile', uploadMiddleware.any(), async (req, res) => {
  const tmp = await mkdtemp(...)
  for (const f of req.files) await writeFile(join(tmp, f.fieldname), f.buffer)
  await exec(`typst compile ${join(tmp, 'main.typ')} ${join(tmp, 'out.pdf')}`)
  res.type('application/pdf').send(await readFile(join(tmp, 'out.pdf')))
})
```

Point the button at your endpoint:

```jsx
<DownloadButton endpoint="https://api.example.com/press/typst/compile" />
```

Press doesn't prescribe the backend; it prescribes the protocol.

## A whole-book Download button

Putting it together, the button looks like this. One click, whole book, PDF primary and sources secondary:

```jsx
import React, { useState } from 'react'
import { compileSubtree, triggerDownload } from '@uniweb/press'
import { ChildBlocks, useWebsite } from '@uniweb/kit'

async function gatherBlocks(website, rootPath) {
  const pages = (website.pages || []).filter((p) =>
    !rootPath || p.route === rootPath || p.route.startsWith(rootPath + '/')
  )
  // Split-mode sites lazy-load per-page content. Await before aggregating.
  await Promise.all(
    pages.map((p) => p.loadContent?.() ?? Promise.resolve()),
  )
  return pages.flatMap((p) => p.bodyBlocks || [])
}

export default function DownloadButton({ rootPath, meta, preamble, template }) {
  const { website } = useWebsite()
  const [busy, setBusy] = useState(null)

  const run = async (mode) => {
    setBusy(mode)
    try {
      const blocks = await gatherBlocks(website, rootPath)
      const blob = await compileSubtree(
        <ChildBlocks blocks={blocks} />,
        'typst',
        {
          basePath: website.basePath,
          adapterOptions: {
            mode: mode === 'pdf' ? 'server' : 'sources',
            meta,
            preamble,
            template,
          },
        },
      )
      triggerDownload(blob, `book.${mode === 'pdf' ? 'pdf' : 'zip'}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex gap-2">
      <button onClick={() => run('pdf')} disabled={!!busy}>
        {busy === 'pdf' ? 'Building…' : 'Download PDF'}
      </button>
      <button onClick={() => run('zip')} disabled={!!busy} title="Typst sources">
        .zip
      </button>
    </div>
  )
}
```

**`rootPath` scopes the aggregation.** A site with a marketing landing at `/` and the book at `/book/*` passes `rootPath="/book"` so the Download button ignores the landing and compiles only the book. Omit it to compile every page in the site.

**Block gathering is split-mode-aware.** `page.loadContent()` is a no-op when content is already embedded (the non-split case). In split mode it fetches `_pages/<route>.json`. Either way, `bodyBlocks` is populated by the time `compileSubtree` walks the tree.

## The preamble and template

Every `mode: 'server'` or `mode: 'sources'` call writes a 5-file bundle. Three of those files come from Press itself (`main.typ`, `meta.typ`, `content.typ`); the other two (`preamble.typ`, `template.typ`) are **foundation-supplied**. Press provides a minimal default if you pass nothing, but a real book foundation ships its own typography.

**`preamble.typ`** defines named functions that Press builders call into:

```typst
#let chapter-opener(number: none, title: "", subtitle: "") = {
  pagebreak(weak: true)
  v(1.5in)
  if number != none {
    align(center, text(size: 11pt)[Chapter #number])
    v(0.4em)
  }
  align(center, text(size: 20pt, weight: "bold")[#title])
  if subtitle != "" {
    v(0.4em)
    align(center, text(size: 13pt, style: "italic")[#subtitle])
  }
  v(1.5em)
}

#let section-break() = {
  v(1em)
  align(center, text(size: 12pt, "⁂"))
  v(1em)
}
```

The names are the contract. Changing a name here is equivalent to changing a CSS class referenced from JSX: both sides have to move together.

**`template.typ`** owns page geometry, running headers/footers, the title page, and the table of contents. It's called with the metadata dictionary and the document body:

```typst
#let template(meta: (:), doc) = [
  #set page(width: 6in, height: 9in, ...)
  #set text(size: 11pt, lang: meta.at("language", default: "en"))
  #set par(justify: true, leading: 0.72em, first-line-indent: 1.4em)
  // title page, TOC, …
  #doc
]
```

Foundations pass both strings into the button as `preamble` / `template` props. For a starting point, import them from your preferred source and extend — Press itself doesn't ship book typography, only the compile pipeline.

## What Press doesn't do (for books)

- **Per-page navigation UX.** Sidebar, TOC-on-the-right, reading progress, chapter-switch transitions — all foundation-level concerns. Press aggregates and compiles; the web UX is whatever the foundation renders.
- **Asset bundling.** Press emits `#image("<src>")` calls using whatever URLs the section builders received. If your book uses images, point `<Image src>` at URLs that the Typst compiler can reach — a public CDN URL, a path under the site's `public/` directory, or the server-mode endpoint's asset store. Press does not fetch, hash, and embed image bytes today (on the roadmap for docx parity).
- **Fonts in browser-side WASM compile.** When the `wasm` mode ships, fonts will be a foundation concern (ship font files or fall back to Typst's built-ins). The Vite dev plugin and production endpoints just use whatever fonts the `typst` binary sees on the host.

## See also

- [Concepts](../concepts.md) — the four ways to combine preview and registration, why compile is separate from download.
- [The docusite pattern](./docusite.md) — short-form "URL IS the document" reports using the docx adapter.
- [The preview pattern](./preview-pattern.md) — render a compiled Blob into an iframe as a cross-check, independent of the React preview.
- [Writing a custom adapter](./custom-adapter.md) — add support for a format Press doesn't ship.

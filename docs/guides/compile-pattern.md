# The compile pattern

`compileSubtree` is invoked the same way regardless of who's calling it — a Download button in the browser or a headless CLI. Knowing the four-step shape makes both easier to write, and easier to recognize when reading someone else's code.

## The four steps

1. **Gather blocks.** Decide which `Block` instances belong in the output. The decision is host- and intent-specific: one chapter, every chapter, the active page, a user-selected range. Press doesn't make this decision; the caller does.
2. **Build a React tree.** Hand the blocks to `<ChildBlocks blocks={blocks} />` (from `@uniweb/kit`) so each block renders through its registered section type. The tree is what `compileSubtree` walks.
3. **Compile.** Call `compileSubtree(tree, format, options)`. Returns a `Promise<Blob>`. Press wraps the tree in a throwaway `<DocumentProvider>`, runs `renderToStaticMarkup`, lets each section's `useDocumentOutput` register its fragment, and dispatches the format adapter against the collected store.
4. **Sink the Blob.** Hand it off — `triggerDownload(blob, filename)` for browsers, `await writeFile(path, Buffer.from(await blob.arrayBuffer()))` for headless tools, anything else for novel hosts (HTTP response, blob storage, email attachment).

The first and last steps vary per host. The middle two don't.

## Browser variant — Download button

The foundation publishes a component. The user clicks. The button gathers blocks for whatever scope it represents and compiles.

```jsx
import { compileSubtree, triggerDownload } from '@uniweb/press'
import { ChildBlocks, useWebsite } from '@uniweb/kit'

export function DownloadButton({ scope }) {
  const { website } = useWebsite()
  const onClick = async () => {
    const blocks = gatherBlocks(website, scope)            // (1)
    const tree = <ChildBlocks blocks={blocks} />           // (2)
    const blob = await compileSubtree(tree, 'docx', {})    // (3)
    triggerDownload(blob, 'document.docx')                 // (4)
  }
  return <button onClick={onClick}>Download</button>
}
```

The button is, architecturally, a wrapper around `compileSubtree`. The UI is incidental; the assembly is the point.

## Full-document variant — `compileDocument`

`compileSubtree` is the primitive — "I decided the tree, give me bytes." The common case, though, is "compile this whole website as a document through this foundation." That case involves three concerns `compileSubtree` leaves to the caller: gathering blocks, assembling format-specific adapter options (meta, preamble, template, cover assets, stylesheet), and mapping user-facing format names (like `pdf`) to the underlying Press adapter (like `typst`). `compileDocument` handles those.

```js
import { compileDocument } from '@uniweb/press'
import foundation from '../foundation.js'

const blob = await compileDocument(website, { format: 'pdf', foundation })
```

It reads `foundation.outputs[format]`, calls that entry's `getOptions(website, ...)`, optionally re-routes through the Press format declared by `via:`, gathers `website.pages[*].bodyBlocks`, and hands the whole thing to `compileSubtree`. Foundations declare the per-format details in one place; hosts (browser Download buttons, `unipress`, anything else) just say "compile this website as format X through this foundation."

See [Foundations + headless hosts](#foundations--headless-hosts) below for how this lands on the foundation side.

Two shapes:

- **Website mode** — `compileDocument(website, { format, foundation, rootPath?, ...hostHints })`.
  Gathers blocks (optionally scoped by `rootPath`), uses the foundation's declared outputs, returns a Blob.
- **Tree mode** — `compileDocument(<tree>, { format, adapterOptions? })`.
  A thin pass-through to `compileSubtree` for callers that assembled the tree themselves. Useful when the block selection policy isn't "every page" — e.g., a range slider that compiles a user-picked subset, or a preview that compiles one section. The outputs lookup is skipped in this mode; the caller supplies adapter options directly.

`compileSubtree` remains the low-level primitive and is exported unchanged.

## Headless variant — `unipress` (Node)

`unipress` is a CLI that compiles a content directory into a document file using a Uniweb foundation, with no browser. Same four steps, different sinks at the ends.

```js
import { writeFile } from 'node:fs/promises'

const blob = await foundation.compileDocument(website, {  // (1)–(3)
  format: 'pdf',
  foundation,
})
await writeFile(out, Buffer.from(await blob.arrayBuffer()))  // (4)
```

Steps 1–3 collapse into one call because `compileDocument` does the gathering, the tree-building, and the adapter-options assembly on the caller's behalf — reading the foundation's own outputs declaration. Steps 1 and 4 still vary per host (which blocks, where the bytes go); steps 2 and 3 stay fixed.

If a host needs to customize step 1 — compile a subtree, a user-picked range, a single page — it can either pass `rootPath` (for path-based scoping) or fall back to `compileSubtree(tree, format, options)` with its own tree.

Two notes on how headless callers reach these functions:

- **`foundation.compileDocument(...)` instead of `import { compileDocument } from '@uniweb/press'`.** Same reason as `compileSubtree`: when a headless host imports `@uniweb/press` directly, it ends up with a different physical Press instance than the one bundled inside the foundation. The two have separate `DocumentContext` objects (separate `React.createContext()` calls), foundation registrations land in their bundled context, and the host-imported `compileSubtree`'s wrapper looks at the host's context, finds nothing, and returns an empty Blob (with a `useDocumentOutput was called outside of a <DocumentProvider>` warning per registration). The fix is to reach the foundation's bundled Press through re-exports the foundation auto-emits when it depends on `@uniweb/press` — see [Foundations + headless hosts](#foundations--headless-hosts) below. Both `compileSubtree` and `compileDocument` are re-exported this way.
- **`globalThis.uniweb.childBlockRenderer` must be installed** before the website-mode call. Headless hosts call `initPrerender(content, foundation)` from `@uniweb/runtime/ssr` to set it up; browser runtimes install it automatically. Tree-mode callers don't need it (they pass their own tree).

## What the steps do *not* share

It's tempting to wrap the four steps in a `compileForMe(website, options)` helper. We don't, for now, because the variation lives in steps 1 and 4 and doesn't compress cleanly:

| Decision | Examples |
|---|---|
| **Which blocks?** | active page only · whole site · subtree under a path · user-picked subset · pages matching a filter · recent N |
| **Where do bytes go?** | browser download · file on disk · HTTP response body · S3 object · email attachment · piped to another tool |

A helper that covers all of these is knob-heavy; one that picks just one strategy doesn't actually share the variation. Steps 2 and 3 are already a single line each, so wrapping just those gains nothing.

If a pattern emerges across many foundations — three or four with the same gather-and-sink shape — that's the time to extract a helper. We don't have that evidence yet.

## Foundations + headless hosts

For a foundation to be reachable by a headless host (`unipress` today; potentially other tools later), it has to depend on `@uniweb/press` so the bundled copy of the compile primitives is exposed on the foundation's built module. This happens automatically: when a foundation declares `@uniweb/press` in its `dependencies` (or `peerDependencies`), `@uniweb/build`'s entry generator appends `export { compileSubtree, compileDocument } from '@uniweb/press'` to the foundation's `_entry.generated.js`. Both functions become externally callable on the foundation's built module.

Foundation devs writing onClick Download buttons don't need to know about this — the same import works in either world. The re-export only matters to the headless host calling in from outside.

### Declaring outputs

For `compileDocument(website, { format, foundation })` to work, the foundation declares its supported formats in a `outputs:` map on its default export:

```js
// foundation/src/foundation.js
import { buildTypstOptions, buildPagedjsOptions } from './compile-options.js'

export default {
  defaultLayout: 'BookLayout',
  outputs: {
    typst: {
      extension: 'zip',
      getOptions: buildTypstOptions,
    },
    pdf: {
      extension: 'pdf',
      via: 'typst',                      // compile through the typst adapter
      getOptions: buildTypstOptions,
    },
    pagedjs: {
      extension: 'html',
      getOptions: buildPagedjsOptions,
    },
  },
}
```

Per-format fields:

| Field | Required | Purpose |
|---|---|---|
| `getOptions(website, hostOptions) → { adapterOptions }` | No | Assembles format-specific adapter options (meta, preamble, template, assets, stylesheet, cover, …). `hostOptions` carries the rest-args passed to `compileDocument` (e.g., `mode: 'server'`, `endpoint`, `rootPath`) so the foundation can tailor. Returning nothing is equivalent to `{}`. |
| `via` | No | Press format to compile through. Defaults to the output key itself. Use when the user-facing format name differs from the underlying Press adapter — e.g., `pdf` → `typst` when the host finishes the compile locally with a typst binary. |
| `extension` | No | Default file extension for this output. Hosts use it when deriving an output filename. Conventional, not enforced. |

A single output entry can serve both web and headless callers when the two want the same adapter options. If they diverge (e.g., browser pdf uses server mode with an endpoint, headless uses sources mode), `getOptions` can read those modes from `hostOptions` and branch accordingly.

## See also

- [Concepts](../concepts.md) — why compile is decoupled from download, and the four ways to combine preview and registration.
- [Publishing a book](./book-publishing.md) — the deep version of the browser variant, with a real `<DownloadButton>` that scopes by `rootPath` and handles split-mode block loading.
- [The preview pattern](./preview-pattern.md) — render a compiled Blob into an iframe to cross-check the registration walk.

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

## Headless variant — `unipress` (Node)

`unipress` is a CLI that compiles a content directory into a document file using a Uniweb foundation, with no browser. Same four steps, different sinks at the ends.

```js
import { writeFile } from 'node:fs/promises'

const blocks = website.pages.flatMap(p => p.bodyBlocks ?? []) // (1)
const tree = globalThis.uniweb.childBlockRenderer({ blocks }) // (2)  see note
const blob = await foundation.compileSubtree(tree, 'typst', {}) // (3)  see note
await writeFile(out, Buffer.from(await blob.arrayBuffer()))   // (4)
```

Two notes specific to headless callers:

- **`globalThis.uniweb.childBlockRenderer({ blocks })` instead of `<ChildBlocks blocks={blocks} />`.** Behaviorally identical — Kit's `<ChildBlocks>` literally calls `globalThis.uniweb.childBlockRenderer(props)`. The difference matters only because `@uniweb/kit` ships raw .jsx, and Node-side hosts often don't want a JSX loader in their toolchain. Using the renderer directly avoids that.
- **`foundation.compileSubtree(...)` instead of `import { compileSubtree } from '@uniweb/press'`.** When a headless host imports `@uniweb/press` directly, it ends up with a different physical Press instance than the one bundled inside the foundation. The two have separate `DocumentContext` objects (separate `React.createContext()` calls), foundation registrations land in their bundled context, and `compileSubtree`'s wrapper looks at the host's context, finds nothing, and returns an empty Blob (with a `useDocumentOutput was called outside of a <DocumentProvider>` warning per registration). The fix is to reach the foundation's bundled Press through a re-export the foundation auto-emits when it depends on `@uniweb/press`. See [Foundations + headless hosts](#foundations--headless-hosts) below.

## What the steps do *not* share

It's tempting to wrap the four steps in a `compileForMe(website, options)` helper. We don't, for now, because the variation lives in steps 1 and 4 and doesn't compress cleanly:

| Decision | Examples |
|---|---|
| **Which blocks?** | active page only · whole site · subtree under a path · user-picked subset · pages matching a filter · recent N |
| **Where do bytes go?** | browser download · file on disk · HTTP response body · S3 object · email attachment · piped to another tool |

A helper that covers all of these is knob-heavy; one that picks just one strategy doesn't actually share the variation. Steps 2 and 3 are already a single line each, so wrapping just those gains nothing.

If a pattern emerges across many foundations — three or four with the same gather-and-sink shape — that's the time to extract a helper. We don't have that evidence yet.

## Foundations + headless hosts

For a foundation to be reachable by a headless host (`unipress` today; potentially other tools later), it has to depend on `@uniweb/press` so the bundled copy of `compileSubtree` is exposed as `foundation.compileSubtree`. This happens automatically: when a foundation declares `@uniweb/press` in its `dependencies` (or `peerDependencies`), `@uniweb/build`'s entry generator appends `export { compileSubtree } from '@uniweb/press'` to the foundation's `_entry.generated.js`. The foundation's bundled `compileSubtree` becomes externally callable.

Foundation devs writing onClick Download buttons don't need to know about this — the same import works in either world. The re-export only matters to the headless host calling in from outside.

## See also

- [Concepts](../concepts.md) — why compile is decoupled from download, and the four ways to combine preview and registration.
- [Publishing a book](./book-publishing.md) — the deep version of the browser variant, with a real `<DownloadButton>` that scopes by `rootPath` and handles split-mode block loading.
- [The preview pattern](./preview-pattern.md) — render a compiled Blob into an iframe to cross-check the registration walk.

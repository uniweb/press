# Press architecture

This is a contributor-oriented description of how Press is put together. It is the map — a walk through what exists and how the pieces fit.

For the *commitments* that shape these pieces, read [principles.md](./principles.md) first. For what it takes to add a new format, see [adding-a-format.md](./adding-a-format.md). For deploying a compile endpoint in production, see [deployment.md](./deployment.md). For the near-term format roadmap, see [format-roadmap.md](../design/format-roadmap.md).

If you are *using* Press — wiring up a Download button, writing a section component that opts into a format — read the [Concepts](../concepts.md) doc and the guides first. This document is for people extending Press.

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
                   │ (IR walk or          │  HTML-based: renderToStaticMarkup → htmlToIR
                   │  passthrough)        │  data-shape: identity
                   └───────────┬──────────┘
                               │
                               ▼
                   ┌─────────────────────────────────────┐
                   │ Adapter (lazy-loaded)               │
                   │  docx.js   typst.js   latex.js      │
                   │  xlsx.js   pagedjs.js epub.js       │
                   │  (never in the main bundle)         │
                   └───────────┬─────────────────────────┘
                               │
                               ▼
                            Blob
```

Nothing in the core of Press knows what `"docx"` means. The format string is an arbitrary tag; the registration fragment is whatever shape that adapter consumes; the adapter is a single dynamic-imported module with one public function. Adding a new format is additive — see [principle 1](./principles.md#1-registration-is-the-only-mandatory-contract).

## The registration model

Registration is the contract between section components and the compile pipeline. A section component, during its render, calls:

```js
useDocumentOutput(block, format, fragment, options)
```

Several details worth pinning down:

**The key is the `block`**, not a page, not a section name. Blocks are Uniweb's per-section runtime instances — identity is stable across re-renders of the same section, distinct across sections of the same type. The provider's store is a `WeakMap<Block, Map<format, entry>>` so unmounted block references become eligible for GC. A parallel `blockOrder` array preserves insertion order because `WeakMap` isn't iterable.

**Registration is synchronous during render**, not in `useEffect`. This matters enough to be a hard constraint. The walker code runs right after React finishes rendering — effects haven't flushed yet — so if registration waited for effects, the compile pipeline would have to wait too, which would force every download flow to be async in a place where it doesn't need to be. More pointedly, it would break `renderToStaticMarkup` + "immediately compile" entirely, which is the mechanism subtree compilation depends on. Registration-during-render is idempotent (same block+format overwrites), so Strict Mode's intentional double-render is harmless.

**The fragment is adapter-specific.** For HTML-based formats the fragment is JSX, rendered to HTML: docx, typst and latex parse that HTML to IR, while pagedjs and epub (which share the `'html'` key) take it as it is. For data-shape formats (xlsx) it's a plain object like `{ title, headers, data }`. For a hypothetical JSON-export adapter it could be any serialisable value. The registration layer has no opinion.

**Roles are the only axis of structure.** `options.role` is `'body'` (default), `'header'`, `'footer'`, or `'metadata'`. Body fragments append to a `sections` array in registration order; header/footer are single (last wins); metadata is a plain pass-through object for document-level properties. Adding a new role is a tiny change in one file.

## Single-page vs subtree compilation

Press has two compile entry points, and the distinction matters.

Historically there was one: `useDocumentCompile()` reads the active page's provider, compiles, returns a Blob. One page → one document. Fine for short documents (a CV, a one-page report, a typical docusite).

Books broke this model. One URL per chapter, one chapter per render, a Download button whose scope is *all chapters*. The store attached to the active route sees only one chapter's registration.

Press now has a second primitive, `compileSubtree`, which renders any React subtree off-screen through a `DocumentProvider` with an externally-owned store. The canonical book call looks like:

```js
const blocks = website.pages.flatMap((page) => page.bodyBlocks || [])
await compileSubtree(<ChildBlocks blocks={blocks} />, 'typst')
```

That renders every block on every page through `renderToStaticMarkup` into an external store, then compiles. No page routing, no effects, no DOM mounts. Uniweb's object graph — `Website → Page → Block` — is plain JS, already populated, so walking it is free; React is a *transform* over that graph, not a mounting concern.

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
│                              │  out.                          │
│                              │                                │
│  Right for:                  │  Right for:                    │
│  - single-page documents     │  - whole-site (book) downloads │
│  - on-the-page compile       │  - build-time SSG compile      │
│                              │  - headless export pipelines   │
└───────────────────────────────────────────────────────────────┘
```

Both funnel into the same `compileOutputs(store, format)` → adapter dispatch pipeline. The difference is only in *how the store got populated*.

**The store is decoupled from the React lifecycle.** `createStore()` builds a store that's not tied to a component. `DocumentProvider store={externalStore}` uses it instead of building one internally. This is what makes `compileSubtree` possible at all: you render a subtree into a store you own, then hand the store to `compileOutputs`. It's also why both compile entry points converge on a single lazy-load path — see [principle 2](./principles.md#2-adapters-are-dynamic-imported).

**The provider re-wraps fragments at compile time.** Section components render inside a full React context stack — `BasePathContext`, Uniweb runtime context, Kit contexts, foundation contexts. When the compile pipeline re-renders fragments via `renderToStaticMarkup`, it starts outside that stack; builders that read context would see defaults and emit, e.g., unprefixed URLs. The provider exposes `store.wrapWithProviders(children)` — a closure capturing the current prop stack at provider-mount time — which the compile pipeline calls to re-wrap each fragment before rendering. Adding a new context a builder needs (theme, locale, foundation props) is one line inside `wrapWithProviders` in `DocumentProvider.jsx`; the compile pipeline doesn't need to change.

## The IR: when it helps, when it gets in the way

Press ships a compact intermediate representation (IR) for HTML-based fragments. The walker `htmlToIR(html)` parses HTML via parse5 and produces a tree of `{ type, ...properties, children? }` nodes. `type` comes from the element's `data-type` attribute (falling back to the tag name); other `data-*` attributes map to properties via a declarative attribute map (`attributeMap` in `ir/attributes.js`).

The IR is a **useful intermediate only when multiple format adapters can consume the same tree** — see [principle 4](./principles.md#4-abstraction-level-is-per-format). Today that is docx, typst and latex. Each reads the IR, dispatches by `type`, and emits format-specific output (docx library calls, Typst or LaTeX source strings). The upside is concrete: a Press-aware foundation can produce both `.docx` and `.typ` from the same JSX registrations by switching the format string.

The IR gets in the way when:

- The format's model has no reasonable HTML analogue (xlsx: spreadsheets aren't typography; a tagged blob walker gains nothing over a plain `{ title, headers, data }` object).
- The format has first-class features that don't survive an HTML round-trip (Typst's show rules, LaTeX's custom commands, Paged.js's CSS paged media — these escape via a `<Raw>` builder rather than being modelled in IR).
- The format is an export, not a rendering (a JSON-schema dump, a CSV, a structured archive).

For those cases, adapters accept the registered fragment as-is. The `compileOutputs` pipeline dispatches by format: HTML-based formats go through IR; others are passthrough. See the xlsx adapter as a reference for the data-shape pattern.

## Adapter patterns

Three canonical shapes cover most formats Press will want to support; [adding-a-format.md](./adding-a-format.md) walks through choosing one.

### IR-based adapters (docx, typst, latex)

The fragment is JSX emitting semantic HTML with `data-*` attributes. Walker produces IR. Adapter iterates IR nodes, dispatches by `type`, and emits format-native output.

```
JSX → renderToStaticMarkup → HTML string → htmlToIR → IR tree → adapter-specific emit
```

Shared infrastructure that HTML-based adapters reuse:

- `parseStyledString` (inline HTML marks → text runs with style flags + hyperlinks). Lives under `src/docx/` but is format-agnostic — the typst builders import it, and latex re-exports those builders. Will migrate to `src/` when a third adapter picks it up, per [principle 6](./principles.md#6-extract-shared-logic-when-a-second-adapter-needs-it).
- `resolveUrl` + `BasePathContext` (absolute-URL resolution under subdirectory deployments). `DocumentProvider` supplies the base path; only the docx `Image` builder reads it, since typst and latex bundle their images instead (next item).
- Asset bytes, in `src/assets/` — extracted when a second adapter needed each, per principle 6. `fetch.js` turns asset URLs into bytes: docx embeds one image at a time, and epub collects every image into its package. `inline-images.js` serves the source-bundle adapters: typst and latex fetch the images in a document's body, write them into the bundle and rewrite each `src` to the bundled path. Paged.js keeps the URL references because the browser does the resolving.

### Rendered-HTML passthrough adapters (pagedjs, epub)

The fragment is JSX, as above, but the adapter skips the IR: each fragment is rendered to an HTML string, and the adapter wraps the strings in the shell its format needs — a paginated HTML document for pagedjs, an EPUB3 package for epub. Both read the fragments registered under `'html'`, so a foundation registers once for the two.

```
JSX → renderToStaticMarkup → HTML string → adapter wraps the strings
```

### Data-shape adapters (xlsx, custom JSON exports)

The fragment is a plain JavaScript object whose shape the adapter defines. No HTML, no IR. `compileOutputs` collects the fragments into an array and passes them through.

```
Plain object → collected in registration order → adapter reads directly
```

Useful for formats that aren't rendered documents — spreadsheets, machine-consumable JSON exports, domain-specific XML, compiled data feeds.

### Adapter loading

Adapters are reached only through the `ADAPTERS` map in `src/adapters/dispatch.js`, whose entries load each adapter with a dynamic `import()`; `useDocumentCompile`, `compileSubtree` and `compileDocument` all compile through it. Bundlers emit each adapter as a separate chunk and fetch it on first compile. The adapters directory is **not** in `package.json`'s `exports` field — the only entry points a foundation can import from are the format-agnostic core, the builder subpaths (`/docx`, `/typst`, `/latex`), the formatters (`/format`), the section helpers, the IR utilities, and the dev-only Typst plugin. If an adapter ends up in the main bundle via a stray static import, that's a principle-2 violation and a release blocker.

## See also

- [principles.md](./principles.md) — the architectural commitments Press is built on.
- [adding-a-format.md](./adding-a-format.md) — worked examples (LaTeX, Paged.js) plus the general checklist for a new adapter.
- [deployment.md](./deployment.md) — wire protocol, reference implementations, fonts, and operational concerns for formats that need a backend.
- [format-roadmap.md](../design/format-roadmap.md) — what's shipped, what's next, and what's unlikely.
- [Concepts](../concepts.md) — user-facing mental model: preview strategies, fragment shapes, and the four ways to combine preview and registration.
- [Publishing a book](../guides/book-publishing.md) — how the book pipeline is set up end to end.
# Press restructure — design proposal

**Status:** Revision 2 — incorporates round-1 review answers
**Author:** Diego (with Claude)
**Date:** 2026-04-14
**Supersedes in part:** `kb/framework/plans/documents-package.md` (the phase-1 plan). This document proposes the phase-1.6 restructure that follows the initial ship. The original plan remains the authoritative record of *why* the package exists and what it replaces.

## Revision history

- **Rev 1 (2026-04-14)** — Initial draft. Proposed a "docx-as-default" shape: `@uniweb/press` = complete React + docx solution, with `/ir` as an advanced escape hatch and `/docx` optionally public for non-React callers. Moved `instantiateContent` to a `@uniweb/loom/prosemirror` subpath.
- **Rev 2 (2026-04-14)** — Round-1 review. Seven open questions answered. Package topology flipped from "docx-as-default" to "format-partitioned subpaths" (Q1) — `@uniweb/press` is now the format-agnostic core, and each format (docx today, xlsx/pdf later) lives at `@uniweb/press/<format>`. `instantiateContent` moves to Loom as a named root-level import rather than a subpath (Q2). No back-compat shims (Q3). R5 legacy parity audit gains four concrete reference foundations from Q4. Versioning concern for Loom dropped (Q6, unpublished). R4 gains a kb-docs cleanup sub-phase (Q7).
- **Rev 3 (2026-04-14)** — Round-2 review. Three follow-up questions answered. Press is confirmed *unpublished* (clarifying Q8): R1's "ships alone as a bug fix" framing is dropped in favor of "preflight correctness check before the main restructure." The `src/docx/` flip in R3 happens in one go (Q8) — no temporary name needed. Format-agnostic files live at the top of `src/` rather than under a `src/core/` directory (Q10); `src/orchestrator/` folds into `src/ir/` since `compileOutputs` naturally belongs with the IR layer. R4-kb gets its own review round before execution (Q9).
- **Rev 4 (2026-04-14)** — Round-3 review. `DownloadButton` component is removed from the public API entirely (shipping a button component is a permanent friction source and frames Press as a UI kit, which it isn't). `useDocumentDownload` is replaced with `useDocumentCompile`, which returns `{ compile, isCompiling }` where `compile(format, options?) → Promise<Blob>` — the compile step is now cleanly separated from the download action. A new `triggerDownload(blob, fileName)` utility is exported for foundations that want the simple case. This split matters because "compile + download" is only one of several useful flows (preview, upload, email attachment, etc.), and the primary primitive is "give me a Blob from the registered outputs." **Rev 4 also adds a canonical preview-iframe demo as an R3 deliverable**, because compile-and-preview-before-download is the user's own primary use case and serves as the structural test that the new API is actually composable.
- **Rev 5 (2026-04-14)** — Round-4 review. Two topics added. First, a new `@uniweb/press/sections` subpath is introduced to house higher-level "section template" helpers that foundations keep rewriting — a generic `Section` that combines registration and rendering, and an opinionated `StandardSection` that renders Uniweb's standard content shape. This replaces the legacy SMU `Section` pattern without resurrecting the `block.output` mutation anti-pattern. The existing `/docx` `Section` (a trivial layout wrapper) is deleted in R3 to free up the name. Second, R4 is restructured into four explicit sub-phases (R4a section helpers, R4b Press internal docs, R4c public user-facing docs, R4d kb cleanup) so each piece is correctly sized and independently reviewable. Public docs are acknowledged as 1–2 days of focused writing, not a one-hour appendix.
- **Rev 6 (2026-04-14)** — Round-5 review. Read the original Press/Loom design doc (`press/.inbox/press-package.md`). Three things change: (1) a new §6.5 "Related concepts" section captures the foundation-handlers architecture and the citations design from the original doc, because both affect how Press is used even though neither is a Press concept. (2) Rev 4's decision to move `instantiateContent` from Press's `/sdk` to Loom is reinforced with the handlers-specific reasoning: handlers live in the foundation-config layer (upstream of Press), so the template-engine adapter belongs with the template engine, not the rendering library. The original `/sdk` framing was packaging convenience, not architectural necessity. (3) A new "Framework-level dependencies for R4c" note captures the pre-existing handlers ambiguities that need to be resolved before Press's "building a report foundation" guide can be written: the `default.handlers` vs. `default.capabilities.handlers` shape disagreement, the `(content, block)` vs. `(content, { block, data })` signature disagreement, and the unimplemented `handlers.data` hook. These are framework-level concerns, not Press restructure work, but they block R4c's primary guide. R5's legacy parity audit also gains concrete missing features from the original's gap list: Paragraph `format` modes, Bookmark support, `addSectionSpacing`, and `applyTo` orchestrator wiring.
- **Rev 7 (2026-04-14)** — Round-6 review. Two of the three handlers discrepancies from rev 6 are now resolved with concrete decisions, and the third is confirmed as genuinely missing work. **Resolved:** the handler signature is `(content, block)` — the current code is correct, the original design doc was slightly off, no change needed. **Resolved:** the foundation export shape should be `default.handlers.content` (top-level), which is what the original design intended and what makes sense; the current code's `default.capabilities.handlers.content` nesting is an implementation bug that someone introduced and needs to be fixed in the framework. **Confirmed missing:** `handlers.data` is genuinely not implemented. Investigation of `framework/core/src/datastore.js` and `entity-store.js` found a related-but-different mechanism — named transforms registered via `datastore.registerTransform(name, fn)` — which serves source-level normalization but **cannot** replace `handlers.data` because it doesn't see the block and can't filter on block-level params. `handlers.data` is still required for the primary report-foundation filter case. Rev 7 also adds a concrete "Framework-level work needed" punch list in §6.5 covering all the framework tasks required to make Press's R4c `report-foundations.md` guide writable.

## 1. Summary

`@uniweb/press` shipped phase 1 with four subpaths: `.` (IR utilities + accidentally-eager docx re-exports), `/react` (builders + provider + hook + download button), `/sdk` (content helpers and formatting utilities), and `/docx` (the docx adapter). This document proposes re-organizing that surface around **format partitioning**: the root is the format-agnostic core, and each format (docx today, xlsx and pdf when they ship) lives at `@uniweb/press/<format>`.

- `@uniweb/press` — format-agnostic core: `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`.
- `@uniweb/press/docx` — docx React primitives: `Paragraph`, `TextRun`, `H1`–`H4`, `Image`, `Link`, `List`. The trivial layout-wrapper `Section` that existed in phase 1 is removed (see §5 "Why the old Section goes away").
- `@uniweb/press/sections` — higher-level section templates that compose primitives from `/docx` with registration: a generic `Section` that register-and-renders, and an opinionated `StandardSection` that reads Uniweb's standard content shape.
- `@uniweb/press/ir` — advanced escape hatch for custom adapter authors: `htmlToIR`, `attributeMap`, `compileOutputs`.
- `@uniweb/press/xlsx`, `@uniweb/press/pdf` — future subpaths, symmetric with `/docx`, added when those adapters land.

The existing `/react` and `/sdk` subpaths go away. The docx adapter itself (`compileDocx`, `buildDocument` and the large `docx` library dependency) lives at an internal path that `useDocumentCompile` reaches via dynamic import; it is not a public subpath. This preserves the lazy-loading story: a foundation that imports `@uniweb/press/docx` for its React builders does *not* pull in the 3.4 MB `docx` library. The library only loads when `compile('docx')` is actually called.

In parallel, **`instantiateContent` moves to `@uniweb/loom` as a named root-level export**, where it belongs. Press stops containing Loom-adaptation code; Loom gains a first-class integration story without coupling its class to ProseMirror.

The motivation is twofold:

1. **Framing honesty.** The phase-1 split between `/react` and `/docx` wasn't a format-agnostic-vs-docx split — the "React layer" was 100% docx-shaped. Partitioning by format instead by runtime removes the confusion.
2. **Symmetric future growth.** When xlsx ships, a `/xlsx` subpath sits alongside `/docx` with zero asymmetry. No "why is docx special" conversation.

## 2. Background

Phase 1 landed with a deliberate split between `/react` and `/docx` based on an implicit principle: "React surface goes in `/react`, vanilla JS goes elsewhere." In practice that principle doesn't hold:

- The so-called "React layer" is entirely docx-shaped. Every `data-*` attribute on every builder component corresponds to a `docx` library primitive (margins → `WidthType.DXA`, borders → `BorderStyle`, `data-positionaltab-*` → `PositionalTab`, etc.). The builders are not a format-neutral React layer with adapters hanging off them; they are the React-facing surface of a docx adapter.
- The registration hook (`useDocumentOutput`) *is* format-neutral — it stores any fragment in a `WeakMap<Block, Output>` keyed by format string — but it's bundled under `/react` alongside the docx builders, making it look coupled to them when it isn't.
- The `/sdk` subpath was a catch-all for four unrelated things (a ProseMirror walker, a styled-string parser, legacy formatting utilities, and a docx unit-conversion re-export). Three of the four don't belong in Press at all, and the one that does (`parseStyledString`) is a private implementation detail of `<Paragraph>`.
- The root `@uniweb/press` export currently re-exports `compileDocx` and `buildDocument` from `./docx/index.js`. That static re-export transitively pulls the 3.4 MB `docx` library into any consumer that imports `@uniweb/press`, silently defeating the lazy-loading story the README advertises.

These problems all trace to a single structural mistake: **organizing subpaths by runtime (React vs. vanilla) instead of by audience (default user vs. advanced author vs. Loom integration).** This proposal re-organizes by audience.

### Why Loom is involved

`src/sdk/instantiate.js` is a 55-line walker that traverses a ProseMirror document and calls `engine.render(text, vars)` on every text node. The `engine` argument is Loom (or any engine with a `render` method). The function has zero Press-specific concepts — no docx, no IR, no builder components. It's Loom-over-ProseMirror, which is an integration Loom should own.

Loom's own README already directs users to `@uniweb/press/sdk` for this helper. That's the wrong direction: Press depends on Loom's API shape, and Loom publicly advertises a Press subpath it doesn't control. Moving the function to Loom fixes both the dependency direction and the documentation loop.

## 3. Problems to solve

Numbered so we can track them through the decisions section.

- **P1** — The `/react` name implies format-neutral React primitives; the builder components are docx-specific.
- **P2** — `useDocumentOutput` is format-neutral but lives under the docx-shaped `/react` path.
- **P3** — The root barrel eagerly re-exports from `./docx/index.js`, breaking lazy loading.
- **P4** — Root-level IR exports (`htmlToIR`, `attributeMap`) are advanced-use utilities promoted to default-import visibility.
- **P5** — `/sdk` bundles four unrelated things, none of which have a clear place in Press.
- **P6** — `instantiateContent` is Loom-adaptation code living in Press. Dependency flow is backwards.
- **P7** — `parseStyledString` is a private implementation detail of `<Paragraph>` that's exported as if it were a public API.
- **P8** — `makeCurrency` / `makeRange` / `makeParentheses` / `join` duplicate formatting Loom already does better (with Loom's graceful-empty semantics) and are legacy report-sdk cruft.
- **P9** — `convertMillimetersToTwip` is re-exported from `@uniweb/press/sdk` but is just the `docx` library function passed through; consumers can import it themselves.
- **P10** — The README frames Press as "registration for any format." Reality is "docx from JSX, same source for preview and download." Framing obscures the primary use case.

## 4. Goals and non-goals

### Goals

- **G1** — The default `@uniweb/press` import is a complete, self-sufficient docx solution. Drop-in, no subpath hunting for the common case.
- **G2** — The package surface signals "docx-first" clearly. Advanced use cases (custom adapters, direct IR access) are available but correctly labeled as advanced.
- **G3** — Bundle size is preserved or improved. The `docx` library remains lazy-loaded; fixing P3 actually *reduces* default bundle size from today.
- **G4** — Loom owns its own ProseMirror integration. Press stops containing Loom-adaptation code.
- **G5** — The restructure is mechanical for users: each removed export has a clear replacement, and the migration path is obvious.

### Non-goals

- **N1** — This is not a rewrite. The IR parser, docx adapter, builder components, provider, hook, download button, and orchestrator all stay as they are. This is a surface restructure.
- **N2** — xlsx and pdf adapters are still phased out. This proposal doesn't accelerate them.
- **N3** — We don't re-open the "should we have a unified IR" question. The heterogeneous-registration decision from the kb plan stands.
- **N4** — This is not where we audit legacy feature parity for the docx adapter. That's the next step *after* the restructure lands (see §11).
- **N5** — No TypeScript. Plain JS + JSDoc per Uniweb convention.

## 5. Proposed shape — Press

Three public entry points for phase 1.6. Future phases add `/xlsx` and `/pdf` symmetrically.

```
@uniweb/press                     FORMAT-AGNOSTIC CORE
  │
  ├─ DocumentProvider
  ├─ useDocumentOutput     (registration side — components call this)
  ├─ useDocumentCompile    (download side — returns compile(), Blob-producing)
  └─ triggerDownload       (utility — Blob → browser file download)

@uniweb/press/docx                DOCX REACT PRIMITIVES (atoms)
  │
  ├─ Paragraph, Paragraphs
  ├─ TextRun
  ├─ H1, H2, H3, H4
  ├─ Image, Images
  ├─ Link, Links
  └─ List, Lists
  (no Section — deleted in R3; see "Why the old Section goes away")

@uniweb/press/sections            SECTION TEMPLATES (molecules)
  │
  ├─ Section                (generic register-and-render wrapper)
  └─ StandardSection        (opinionated Uniweb content-shape renderer)

@uniweb/press/ir                  ADVANCED — custom adapter authors
  │
  ├─ htmlToIR
  ├─ attributesToProperties
  ├─ attributeMap
  └─ compileOutputs

(future, symmetric with /docx)
@uniweb/press/xlsx                XLSX primitives  — phase 2
@uniweb/press/pdf                 PDF primitives   — phase 3
```

Typical usage for a docx-producing foundation:

```jsx
import {
  DocumentProvider,
  useDocumentOutput,
  useDocumentCompile,
  triggerDownload,
} from '@uniweb/press'
import { Paragraph, H1, H2, Image } from '@uniweb/press/docx'

function Cover({ block, content }) {
  const markup = (
    <>
      <H1 data={content.title} />
      <H2 data={content.subtitle} />
      {content.image && <Image data={content.image} />}
    </>
  )
  useDocumentOutput(block, 'docx', markup)
  return <section>{markup}</section>
}

function DownloadMenu() {
  const { compile, isCompiling } = useDocumentCompile()
  const handleDownload = async () => {
    const blob = await compile('docx', { title: 'Annual Report' })
    triggerDownload(blob, 'annual-report.docx')
  }
  return (
    <button onClick={handleDownload} disabled={isCompiling}>
      {isCompiling ? 'Generating…' : 'Download'}
    </button>
  )
}
```

Two imports. The split is semantic and symmetric: `@uniweb/press` handles the registration machinery and the compile pipeline; `@uniweb/press/docx` provides the React primitives that produce docx. When `/xlsx` arrives, a foundation that wants both formats imports from both subpaths in parallel — no special-casing.

Note that the foundation writes its own `<button>`. Press intentionally does not ship a `DownloadButton` component — see §5 "Why no button."

### What each entry contains and why

**`@uniweb/press` (root) — the format-agnostic core.** Everything here is indifferent to what format is being produced.

- `DocumentProvider` holds a `WeakMap<Block, Map<format, Output>>`.
- `useDocumentOutput(block, format, fragment, options)` registers an output under any format string. Called by section components in their render body.
- `useDocumentCompile()` returns `{ compile, isCompiling }`. `compile(format, documentOptions?)` dynamic-imports the named format adapter, walks the provider store, runs the adapter, and returns a `Promise<Blob>`. **It does not trigger a download.** Foundations decide what to do with the blob.
- `triggerDownload(blob, fileName)` is a standalone utility function (not a hook) that triggers a browser file download for any Blob. Six lines of DOM — creates an object URL, builds a detached `<a>`, clicks it, revokes the URL. Exported as a convenience so foundations don't rewrite it.

This subpath does not import any format-specific code. It does not import `@uniweb/press/docx`, does not re-export builders, does not touch the `docx` library. A foundation that uses Press only as a pluggable registration system for its own custom format imports exclusively from here.

#### Why no button

Phase 1 shipped a `DownloadButton` component that wrapped the compile-and-download flow in a minimal `<button>`. Rev 4 removes it. Two reasons:

1. **Press is a framework, not a UI kit.** Uniweb already has `@uniweb/kit` for shared React UI. A button component living in Press is either unstyled (foundations have to replace it) or styled (foundations have to override it). Either way it's permanent friction. Press shouldn't own any visual decisions.
2. **"Compile + download" is only one of several useful flows.** A foundation might compile to preview in an iframe, compile to upload to a server, compile to attach to an email draft, compile to stash in IndexedDB. The reusable primitive is "give me a Blob from the registered outputs" — downloading is one thing you might do with that Blob, and it's the least interesting because it's two lines of DOM.

**The anchoring use case is preview-before-download** — users of the current Proximify reporting foundations click "Preview" to see what the docx will look like, scroll through it, then click "Download" to commit. Both actions route through the same compile pipeline; only the post-compile step differs. The phase-1 `DownloadButton` API forced the compile step to be a side-effect of clicking Download, which means Preview had no clean hook to tap into and had to re-invoke the whole pipeline duplicatively. Rev 4's split makes Preview and Download siblings: both call `compile('docx')`, one hands the Blob to `docx-preview` (or similar), the other hands it to `triggerDownload`.

Splitting `useDocumentCompile` (returns a Blob) from `triggerDownload` (triggers a file download) lets foundations compose any flow they want. The cost is five more lines in hello-world. In exchange, the composition becomes the teaching moment: section components register outputs, UI components compile and decide what to do with the result.

Press ships a runnable demo of this flow at `examples/preview-iframe/` — see §9 R3.

### Section templates — `@uniweb/press/sections`

Section-level composition is where foundations duplicate the most code. Every report-producing foundation ends up with some variant of the same pattern:

1. Parse `block.content` into the standard shape (`title`, `subtitle`, `paragraphs`, `images`, `links`, etc.)
2. Build JSX using the builder components (`H1`, `Paragraphs`, `Images`, etc.)
3. Register the JSX as docx output for the block
4. Return a preview wrapper around the same JSX

The legacy `report-sdk` solved (1) via a `parseBlockContent` helper and (3) via `block.output.docx = htmlToDocx(html)` mutation. Both are anti-patterns in the modern system: modern Uniweb's Block class already exposes the parsed shape as `block.content`, and registration happens via the `useDocumentOutput` hook. But the *pattern* of "render the standard content shape and register it for output" is still worth sharing — right now every foundation rewrites the ~20 lines of boilerplate from scratch.

`@uniweb/press/sections` is where that shared pattern lives. Two components, layered:

**Layer 1 — `Section` (generic register-and-render).** Zero content knowledge. Eliminates the boilerplate of "call `useDocumentOutput` and then wrap the same JSX in `<section>`":

```jsx
import { Section } from '@uniweb/press/sections'
import { H1, Paragraph } from '@uniweb/press/docx'

function Cover({ block, content }) {
  return (
    <Section block={block}>
      <H1 data={content.title} />
      <Paragraph data={content.body} />
    </Section>
  )
}
```

Implementation sketch (actual code probably slightly different):

```jsx
export function Section({ block, format = 'docx', children, ...props }) {
  useDocumentOutput(block, format, children)
  return <section {...props}>{children}</section>
}
```

That's it. The `format` prop defaults to `'docx'` because that's the primary use case, but can be any format string. Foundations that need multi-format output compose multiple `useDocumentOutput` calls manually.

**Layer 2 — `StandardSection` (opinionated Uniweb renderer).** Built on top of Layer 1 + `@uniweb/press/docx` primitives. Reads the standard Uniweb content shape and renders it:

```jsx
import { StandardSection } from '@uniweb/press/sections'

function Fallback({ block }) {
  return <StandardSection block={block} />
}
```

Implementation sketch:

```jsx
import { H1, H2, H3, Paragraphs, Images, Links, Lists } from '../docx/index.js'
import { Section } from './Section.jsx'

export function StandardSection({ block, content = block.content, format = 'docx' }) {
  return (
    <Section block={block} format={format}>
      {content.title && <H1 data={content.title} />}
      {content.subtitle && <H2 data={content.subtitle} />}
      {content.description && <H3 data={content.description} />}
      <Paragraphs data={content.paragraphs} />
      <Images data={content.images} />
      <Links data={content.links} />
      <Lists data={content.lists} />
    </Section>
  )
}
```

`StandardSection` is the modern equivalent of legacy SMU's default `Section` component (see `report-modules/src/SMU/components/Section/index.js`), minus the `block.output` mutation and minus the handwritten `htmlToDocx` call — both replaced by the registration hook.

#### Duck typing, not coupling

The obvious question: does this couple Press to Uniweb's Block API? Answer: no. `StandardSection` reads `block.content.title`, `block.content.paragraphs`, etc. — a shape that any content-producing system could conform to. It does not import from `@uniweb/core` and does not call any Block methods. The coupling is nominal (it's called "StandardSection" because that's Uniweb's standard shape) but duck-typed. A non-Uniweb project that produces the same content shape gets `StandardSection` for free.

#### Child blocks are NOT handled in v1

Legacy SMU `Section` also recursed into `block.childBlocks` via `block.getChildBlockRenderer()`. Modern Uniweb has different child-block handling (a global `ChildBlocks` component, inset support, the prerender path). `StandardSection` in v1 deliberately does *not* handle child blocks — it only renders the current block's content. Foundations that need child-block recursion either wrap `StandardSection` in their own component that adds a `<ChildBlocks>` render, or pass `renderChildBlocks` as a future prop once we see how foundations actually want it.

This is the right call for v1 because:

- Child-block handling depends on Uniweb runtime internals that Press shouldn't hardcode.
- Different foundations handle child blocks differently (some ignore them in reports; some render inline; some compose differently by section type).
- It's easy to add a `renderChildBlocks` prop later without breaking anything.

If v2 adds child-block support, it'll be via an explicit prop, not a Press import of `@uniweb/core`.

#### Why not `/uniweb` or a separate package

Naming alternatives considered and rejected:

- **`@uniweb/press/uniweb`** — circular ("Uniweb helpers in `@uniweb/press`") and misleading, because the helpers duck-type on a content shape rather than coupling to Uniweb's Block class.
- **A separate `@uniweb/sdk` or `@uniweb/foundation-helpers` package** — overkill for a single component group. Foundations already import from two Press subpaths (`.` and `/docx`); a third subpath is much cheaper than a third package. If the helper surface grows beyond section templates (content utilities, foundation config helpers, block traversal), *then* we promote to a package. For now, subpath.

`/sections` describes what the components are (section-level templates), is symmetric with `/docx`, and doesn't commit us to anything beyond what we're building.

### Why the old Section goes away

The existing `src/react/components/Section.jsx` is 18 lines of layout wrapper:

```jsx
export default function Section({ children, className = '', ...props }) {
  const base = 'mx-auto w-full max-w-4xl'
  const cn = className ? `${base} ${className}` : base
  return <section className={cn} {...props}>{children}</section>
}
```

It doesn't register output, doesn't read content, doesn't interact with the docx pipeline at all. Its only job is to center content and cap the max-width. Every foundation using Tailwind can write that inline in five seconds, and foundations with different visual conventions are going to replace it anyway. As a Press export it provides ~zero value and occupies a conceptually valuable name.

R3 deletes it. The new `Section` from `/sections` takes the name and does something useful: register-and-render the hook boilerplate.

**`@uniweb/press/docx` — the React primitives that produce docx.** Builder components only. These are React components that emit semantic HTML with `data-*` attributes the docx adapter understands. Importing from here is how a foundation says "I want to produce docx output from JSX."

Critically, this subpath does *not* statically import the docx adapter (which in turn imports the `docx` library). The builders are small React components; importing them is cheap. The adapter is reached only through `useDocumentCompile`'s dynamic import — see "Adapter lazy-loading" below.

**`@uniweb/press/ir` — the HTML→IR walker for custom adapter authors.** `htmlToIR` parses JSX-rendered HTML into an IR tree. `compileOutputs` walks the provider store and applies the parser to every registered fragment, grouping by role. `attributeMap` documents the `data-*` vocabulary. Rare but legitimate audience: someone building a custom HTML-based format adapter (say, a markdown exporter) that reuses Press's walker instead of reinventing it.

### Adapter lazy-loading

The single tricky part of the symmetric shape. The `docx` library is 3.4 MB and should not land in any consumer's main chunk — that was the whole point of the phase-1 lazy-loading design, and P3 identified a bug that silently broke it.

Under the symmetric shape, we need the adapter code (`compileDocx`, `buildDocument`) to live *somewhere*, and that somewhere has to be reachable from `useDocumentCompile` via dynamic import without being statically imported by anything in the `/docx` builder subpath. Two options for where it lives:

**Option A — Internal-only path.** The adapter lives at `src/adapters/docx.js` (new location). It is not listed in `package.json` `exports`, so it is not a public entry point. `useDocumentCompile` reaches it via `await import('./adapters/docx.js')` (or an equivalent path). Anyone who wants direct adapter access without going through React uses `@uniweb/press/ir` to assemble IR themselves, then imports the `docx` library directly.

**Option B — Public internal path.** Same as A but the adapter is also listed in `exports` under a path like `@uniweb/press/docx/adapter` or `@uniweb/press/adapters/docx`, so non-React consumers can reach it without spelunking `src/`. Downside: two public subpaths for "docx things," which the symmetric shape was trying to avoid.

**Recommendation:** Option A. The symmetry argument that made us partition by format also argues for keeping the adapter private — `/docx` is the public docx surface, and a second `/docx/adapter` public entry is asymmetric noise. Non-React callers are a hypothetical audience (no such caller exists today in the workspace); if one appears, we can promote the path then. The escape hatch for "I want to produce a docx Blob outside React" is clean regardless: import from `/ir`, build your fragment shape, call the `docx` library directly.

### What goes away

| Removed | Why | Replacement |
|---|---|---|
| `@uniweb/press/react` | The name implies format-neutral React; the content was docx-specific (P1, P2). | Split: registration machinery → `@uniweb/press`; builders → `@uniweb/press/docx`. |
| `@uniweb/press/sdk` | Catch-all with nothing that belongs in Press (P5). | See §6 for per-item migration. |
| Root `htmlToIR`, `attributeMap`, `attributesToProperties` | Advanced-use, promoted too far (P4). | `@uniweb/press/ir`. |
| Root `compileDocx`, `buildDocument` | Static re-export breaks lazy loading (P3). | Internal-only at `src/adapters/docx.js`; reached via `useDocumentCompile`'s dynamic import. |
| Public `@uniweb/press/docx` pointing at the adapter | Conflates the builder surface and the adapter surface under one name. | The builder surface *becomes* `@uniweb/press/docx`; the adapter goes internal. |
| `DownloadButton` component | A framework shouldn't ship UI (rev 4 discussion above). | Foundations write their own `<button>` — three lines — and call `useDocumentCompile` + `triggerDownload`. |
| `useDocumentDownload` hook | Bundles compile and download into one call, forcing a specific flow. | `useDocumentCompile` + `triggerDownload` as separate primitives. Foundations compose. |
| `Section` layout wrapper in `/docx` | 18-line CSS centering wrapper with no docx pipeline interaction. Occupies the `Section` name without earning it. | Deleted in R3. The name `Section` is reused for the register-and-render helper in `@uniweb/press/sections`. |

### File layout after restructure

```
src/
├── index.js              ← rewritten: exports the format-agnostic core
│                            (DocumentProvider, useDocumentOutput,
│                             useDocumentCompile, triggerDownload)
│
├── DocumentProvider.jsx  ← moved from src/react/
├── DocumentContext.js    ← moved from src/react/
├── useDocumentOutput.js  ← moved from src/react/
├── useDocumentCompile.js ← NEW — extracted from old DownloadButton.jsx
├── triggerDownload.js    ← NEW — extracted from old DownloadButton.jsx
│
├── docx/                 ← PUBLIC docx builder primitives (/docx subpath)
│   ├── index.js          ← barrel exporting the builder components
│   ├── Paragraph.jsx     ← moved from src/react/components/
│   ├── TextRun.jsx
│   ├── Headings.jsx
│   ├── Image.jsx
│   ├── Link.jsx
│   ├── List.jsx
│   └── parseStyledString.js   ← private helper, moved from src/sdk/
│   (no Section.jsx — the old layout wrapper is deleted in R3)
│
├── sections/             ← PUBLIC section templates (/sections subpath)
│   ├── index.js          ← barrel: Section, StandardSection
│   ├── Section.jsx       ← generic register-and-render wrapper
│   └── StandardSection.jsx  ← opinionated Uniweb-content renderer
│
├── adapters/             ← INTERNAL (not in exports field)
│   └── docx.js           ← compileDocx, buildDocument
│                            (was src/docx/index.js — moved and
│                             renamed because the old src/docx/ is
│                             now the public builders subpath)
│
└── ir/                   ← PUBLIC /ir subpath
    ├── index.js          ← barrel: htmlToIR, attributeMap,
    │                              attributesToProperties, compileOutputs
    ├── parser.js         ← htmlToIR implementation
    ├── attributes.js     ← attributeMap + helpers
    └── compile.js        ← compileOutputs (was src/orchestrator/compile.js)
```

Two physical moves of note:

1. **The `src/docx/` flip.** The existing `src/docx/` (which holds the adapter) becomes `src/adapters/docx.js`. The new `src/docx/` holds the React builder primitives. This flip is disorienting in a diff but it's the right long-term shape: `/<format>` paths in the source tree correspond exactly to `/<format>` public subpaths, and the `adapters/` directory is where format adapters live as internal modules loaded lazily. No intermediate name or two-step staging — the swap happens in one change.
2. **Format-agnostic files at the top of `src/`.** `DocumentProvider`, `DocumentContext`, `useDocumentOutput` move from `src/react/` to the top of `src/`, alongside `index.js`. The old `DownloadButton.jsx` is split into two new files at the same level — `useDocumentCompile.js` (the hook) and `triggerDownload.js` (the DOM utility) — and the button component itself is deleted. Five top-level files total; wrapping them in a `src/core/` (or similar) directory would add nesting for no gain and would collide nominally with `@uniweb/core` in the broader workspace. Keeping them flat matches the pattern where `src/index.js` already lives at the top.

The `src/react/` directory disappears entirely. Its format-agnostic contents move to the top of `src/`; its format-specific contents (the `components/` subfolder) move to `src/docx/`.

`src/orchestrator/` disappears too. It only ever contained one file (`compile.js`), which implements `compileOutputs` — the HTML-based-format walker that calls `htmlToIR` internally. That file naturally lives with the IR layer, since it *is* the main consumer of the IR walker. Folding it in means `/ir` becomes one directory with everything a custom adapter author needs: the walker, the attribute map, and the store-to-IR compiler.

`src/sdk/` is deleted. Its four files migrate or die (see §6).

## 6. Proposed shape — Loom

Loom gains `instantiateContent` as a **named root-level export**, not a subpath and not a method on the `Loom` class.

```
@uniweb/loom
  ├─ Loom, LoomCore               (existing)
  └─ instantiateContent            NEW — moved from press/src/sdk/

@uniweb/loom/core                 (existing, unchanged)
```

Call site:

```js
import { Loom, instantiateContent } from '@uniweb/loom'

const loom = new Loom(snippets, customFunctions)
const resolved = instantiateContent(proseMirrorDoc, loom, (key) => data[key])
```

### Why named import, not a method on `Loom`

The original draft proposed either a `/prosemirror` subpath or a class method. Round-1 review narrowed the question to "method vs. named import from root." Named import wins on three grounds:

1. **Engine-agnostic duck typing preserved.** The current implementation takes any object with a `.render(text, vars)` method as the engine argument. That's how `tests/sdk/instantiate.test.js` mocks it today. If we make it a method on `Loom`, we lock it to Loom forever; if a future language engine (say, a second-generation Loom or a different placeholder syntax) appears, the walker can't be reused. Keeping it as a standalone function that takes an `engine` argument preserves the door.
2. **Class stays minimal.** Loom is a language engine — it takes strings, returns strings or values. It has no knowledge of any data shape. Adding `loom.instantiateContent(doc, vars)` would be the first place Loom's class touches ProseMirror's node format, and it would set a precedent ("OK, what other tree shapes does Loom know about?"). Named import keeps Loom's class single-responsibility.
3. **Implementation doesn't change.** The current 55-line function in `press/src/sdk/instantiate.js` is already written as a pure function that takes an engine. Moving it verbatim into Loom as a sibling of the `Loom` class is a file rename, not a redesign. Making it a method would require adapting the signature and re-writing the tests.

The call site is marginally more verbose than a method (`instantiateContent(doc, loom, vars)` vs `loom.instantiateContent(doc, vars)`), but foundations typically call it once per section, and the extra argument makes the dependency direction explicit at the call site — you can see that it's "use this engine to resolve this content."

### Why not a `/prosemirror` subpath either

My original draft proposed `@uniweb/loom/prosemirror` as the home for this function, with the argument that a subpath keeps Loom's root barrel free of ProseMirror-specific code. That argument is weaker than it sounds:

- The function is 55 lines. Adding it to the root barrel costs effectively zero bundle size for consumers that don't call it (tree-shaking).
- Users who only write Compact-form Loom templates already import from `@uniweb/loom/core` to skip the Plain parser; they'll also skip `instantiateContent`. Subpath vs. root doesn't matter for them.
- Subpaths have a cost: more names in `package.json` `exports`, more documentation surface, one more thing for users to discover. Root-level named import is the lowest-ceremony home.

If `instantiateContent` grows into a family (several tree-walking helpers for different shapes), promoting to a subpath becomes a later cleanup. For one function, root is fine.

### Physical location inside Loom

```
loom/src/
├── index.js              ← gains `export { instantiateContent }`
├── instantiate.js        ← new file, moved from press/src/sdk/instantiate.js
├── engine.js             (existing)
├── core/                 (existing)
└── plain/                (existing)
```

No changes to `core/` or `plain/`. The `instantiate.js` file lives at the top of `src/` because it's a sibling of the class, not a member of one of the language-layer directories.

### Other `sdk/` contents — per-item resolution

| File | Current home | Destination | Rationale |
|---|---|---|---|
| `instantiate.js` | `press/src/sdk/` | `loom/src/instantiate.js` (exported from root barrel) | Engine-agnostic walker. Natural fit in Loom. |
| `parseStyledString.js` | `press/src/sdk/` | `press/src/docx/parseStyledString.js` (internal) | Used only by `Paragraph.jsx`. Stops being exported; becomes a private helper next to its sole caller. (P7) |
| `utilities.js` (`makeCurrency`, `makeParentheses`, `makeRange`, `join`) | `press/src/sdk/` | **To be decided after audit (Q5).** | Loom's stdlib covers all four cases more expressively. Need to audit internal and external usage before deleting — see R3 prep step. (P8) |
| `convertMillimetersToTwip` re-export | `press/src/sdk/index.js:13` | **Deleted.** | It's `docx`'s own function. Consumers can `import { convertMillimetersToTwip } from 'docx'`. Press shouldn't be a proxy layer for docx library exports. (P9) |

### Loom README update

Loom's README currently says:

> `instantiateContent` helper in `@uniweb/press/sdk` walks a content tree and resolves placeholders through a Loom instance before the document is rendered

This becomes:

> Loom includes `instantiateContent`, a helper that walks a ProseMirror content tree and resolves `{placeholder}` expressions in every text node through a Loom instance. Useful when your content originates as a ProseMirror document (markdown rendered by `@uniweb/content-reader`, for example) and you want to resolve dynamic values before passing the content on to rendering or export.

And the Press README's "See also" section gains a reciprocal pointer.

### Rev 4's decision, reinforced by handlers context

Rev 4 moved `instantiateContent` from `@uniweb/press/sdk` to Loom on "engine-agnostic duck typing" grounds. The full original design doc (see §6.5) makes the case even cleaner: the function exists to be called by a foundation's **content handler**, which lives in `foundation.js` at the foundation-config layer — upstream of Press entirely. A report foundation's `content` handler looks like:

```js
// foundation.js
import { Loom, instantiateContent } from '@uniweb/loom'

const engine = new Loom()

export default {
  defaultLayout: 'ReportLayout',
  handlers: {
    content(content, context) {
      return instantiateContent(content, engine, key => context.data?.[key])
    },
  },
}
```

The Loom instance and the `instantiateContent` walker are a single concern (template engine + its tree adapter), both imported from Loom. Press isn't in the picture — section components see already-processed content, so they don't care whether any template instantiation happened upstream. Putting the walker in Loom is the correct layering; the original `/sdk` framing would have forced Press to import Loom as a dependency (or, worse, duck-type on it) and the coupling would have been invisible in the package manifest.

This is the practical rev 4 payoff: Press stays a pure React/docx layer, and a foundation wanting placeholder instantiation imports both packages explicitly — the dependency becomes visible.

## 6.5. Related concepts from the original design doc

The original Press design (`.inbox/press-package.md`, preserved verbatim as historical record) covers two topics that aren't Press design decisions but are **Press-adjacent** in ways that affect how users interact with the package. Capturing them here so reviewers have the full picture.

### Foundation handlers — how content actually reaches Press components

Press section components are built on a contract: by the time a section component runs, `block.content` is already parsed into the standard shape (`title`, `paragraphs`, `items`, etc.), and any `{placeholder}` expressions in text nodes have already been resolved against dynamic data. Section components are oblivious to where the processing happened — they just render what they receive.

The processing happens **upstream of Press**, in the Uniweb runtime, via a foundation-declared lifecycle hook called a **content handler**. The foundation's `foundation.js` exports a `handlers` object; the runtime calls `handlers.content(content, context)` before semantic parsing. The handler is where a report foundation wires up a Loom engine, instantiates placeholders against the currently-fetched profile data, and returns clean content for the semantic parser to chew on.

Diagrammatically:

```
Raw content with {placeholders}            Profile data (dynamic)
    │                                             │
    └────────┬────────────────────────────────────┘
             │
             ▼
    foundation.handlers.content(content, { block, data })
             │
             │   Calls instantiateContent(content, loom, vars)
             │   from @uniweb/loom
             │
             ▼
    Instantiated content (no more {placeholders})
             │
             ▼
    Semantic parser (Block.parseContent)
             │
             ▼
    block.content = { title, paragraphs, items, ... }
             │
             ▼
    Press section components see already-processed content
```

A foundation that doesn't need dynamic data (a regular static Uniweb site) simply doesn't declare handlers. Press's section components work identically in both cases.

**Why this is architecturally important for the Press restructure:** it justifies keeping Press format-focused. Without handlers, Press would need a way to plug in template instantiation at the section-component level, and every Press consumer would end up duplicating Loom-integration code. With handlers, Press never sees placeholders — which means Press doesn't need a Loom dependency, doesn't need a template-engine abstraction, and doesn't need to explain placeholder-resolution mechanics in its docs. Press just renders content.

### Current implementation state (rev 7: discrepancies resolved)

The handlers mechanism is partially implemented in the framework. `handlers.content` is wired:

```js
// framework/core/src/block.js:218-231
const contentHandler = globalThis.uniweb?.foundationConfig?.handlers?.content
if (contentHandler && typeof contentHandler === 'function') {
  try {
    const transformed = contentHandler(content, this)
    if (transformed !== undefined) content = transformed
  } catch (err) {
    console.error('Foundation content handler failed:', err)
  }
}
```

And `framework/runtime/src/setup.js:295-305` passes `foundation.default.capabilities` into `foundationConfig`, making `foundationConfig.handlers` accessible at runtime.

**Rev 7 resolved two of the three discrepancies flagged in rev 6 and confirmed the third as real missing work:**

| Aspect | Intended design | Current code | Status |
|---|---|---|---|
| **Handler signature** | `content(content, block)` — block is the context | `content(content, block)` | ✅ **Correct.** Rev 6 misread the original doc; the current code is fine. No change needed. |
| **Foundation export shape** | `default: { handlers: { content } }` — top-level `handlers` key | `default: { capabilities: { handlers: { content } } }` — nested under `capabilities` | ❌ **Bug.** The current `capabilities` nesting was introduced unintentionally. The framework code needs to be fixed to read `foundation.default.handlers` directly. |
| **`handlers.data` hook** | Called after data fetch, before data reaches components. Signature `(data, block)` mirroring the content handler. | Not implemented | ❌ **Missing, non-blocking but required.** Rev 7 investigation confirmed `handlers.data` is not hiding in `DataStore` or `EntityStore`. Filters won't work without it. Must be implemented but doesn't block the Press restructure. |

#### What the DataStore *does* have (and why it doesn't replace `handlers.data`)

During the rev-7 investigation I found a related mechanism in `framework/core/src/datastore.js:49-61, 123-131`: **named transforms** registered via `datastore.registerTransform(name, fn)` and referenced by name in fetch configs (`transform: 'profiles'`). Applied after fetch, before caching. Signature `(data, config) => transformedData`.

This is a different abstraction with a different scope:

| | DataStore named transforms (exists) | `handlers.data` (needed) |
|---|---|---|
| **Scope** | Per fetch config (one data source) | Foundation-wide (any data reaching any block) |
| **Signature** | `(data, config) => data` | `(data, block) => data` |
| **Sees** | Raw data + fetch config | Block + `block.params`, full runtime context |
| **Registered where** | Runtime startup via `datastore.registerTransform(...)` | `foundation.js` default export |
| **Use case** | "Normalize this API's response shape" | "Filter publications by `block.params.dateRange`" |
| **When it runs** | After fetch, before caching | After data is attached to a block, before components see it |

The critical difference is that DataStore transforms **cannot see the block**, so they can't filter differently per report or depend on block-level params. They solve the source-level normalization case but not the block-level filter case. For the typical report-foundation pattern ("this Publications section filters by block.params.yearRange"), you need `handlers.data`, not a DataStore transform.

### Framework-level work needed (rev 7)

The following framework tasks are required for Press to be shippable for its primary use case (report foundations). **None of this is Press restructure work** — it lives in `framework/core/`, `framework/runtime/`, `framework/cli/templates/`, and `framework/cli/partials/`. But R4c's `report-foundations.md` guide depends on it. Listed here so it's tracked and discoverable from the Press design doc.

**Critical (blocks R4c's report-foundations guide):**

1. **Fix the `capabilities` nesting bug.** The runtime currently reads `foundation.default.capabilities` and assigns it to `foundationConfig`, which means foundations have to write `{ capabilities: { handlers: { content } } }` — an extra level of nesting that was never intended. Fix `framework/runtime/src/setup.js:295-305` (and wherever else `capabilities` is consumed) to read handlers directly from `foundation.default.handlers`. Preserve backward compatibility only if there are live foundations using the nested shape (probably none — it was undocumented).
   - Files: `framework/runtime/src/setup.js`, possibly `framework/build/src/foundation/config.js`, possibly `framework/runtime/src/index.jsx`.
   - Test: update any internal test foundation that uses the nested shape.

2. **Implement `handlers.data`.** Mirror `handlers.content`'s structure in `framework/core/src/block.js`. Location: in the data-attachment path, after `EntityStore.resolve()` returns data to a block and before the component reads `block.content.data`. The hook signature is `(data, block) => data`, matching `handlers.content`. Return value replaces the data; `undefined` means no change.
   - Files: `framework/core/src/block.js` (add the call), possibly `framework/core/src/entity-store.js` if the data-attachment pipeline is there.
   - Test: a foundation with a `handlers.data` that filters an array of items by `block.params.filter` — verify the component sees the filtered array.
   - Note: this is the hook the report foundations depend on for filtering publications, funding, etc. by date range or category.

**High priority (needed for foundation authors to discover handlers):**

3. **Add a scaffold stub in the foundation template.** Update `framework/cli/templates/foundation/src/foundation.js.hbs` to include a commented-out `handlers` block showing the shape:
   ```js
   export default {
     defaultLayout: 'MyLayout',
     // props: {},

     // handlers: {
     //   content(content, block) {
     //     // Transform ProseMirror content before semantic parsing.
     //     // Example: instantiate {placeholders} with dynamic data
     //     // via @uniweb/loom's instantiateContent.
     //     return content
     //   },
     //   data(data, block) {
     //     // Transform fetched data before it reaches components.
     //     // Example: filter publications by block.params.yearRange.
     //     return data
     //   },
     // },
   }
   ```
   Stub is commented out so the default foundation still works without handlers. The stub's job is discoverability — a new foundation author sees `handlers` exists without having to read framework source.

4. **Document handlers in `framework/cli/partials/agents.md`.** This is the public foundation-authoring guide that ships as `AGENTS.md` in every new Uniweb project. It currently does not mention handlers. Add a section covering: when to use them, the signatures, the lifecycle (content handler runs before semantic parsing; data handler runs after data fetch before block attachment), the report-foundation use case (Loom + `instantiateContent`), and pointers to Press for the document-output side.

**Medium priority (polish):**

5. **Verify other handler sites.** The original design mentioned handlers as an extensible pattern ("future handlers e.g., `citation`, `i18n`, `validation` follow the same pattern without runtime changes"). For rev 7 we're only committing to `content` and `data`, but the naming convention should be consistent. No code change needed — just a doc note in `agents.md` that the mechanism is extensible.

6. **Error handling.** The current `handlers.content` wrap in `block.js:218-231` catches thrown errors and logs them. `handlers.data` should do the same. Failed handlers should not crash the page; they should log and pass through the original value.

7. **Typedef / JSDoc the `foundation.default` shape** somewhere centrally so it's discoverable. Current foundation config reference is scattered; consolidating into a single reference doc or JSDoc typedef would help foundation authors.

### How this relates to Press's R4c

`docs/guides/report-foundations.md` needs items 1 and 3 at minimum (fix the bug, add the scaffold stub) to be writable against the correct API surface. Item 2 (`handlers.data`) is needed for the guide to show the full report-foundation pattern, which typically includes data filtering. Items 4–7 are quality-of-life improvements that make the guide more useful but aren't hard blockers.

**Recommendation:** tackle items 1, 2, 3, 4 before R4c executes. Item 4 (agents.md) can be the primary deliverable; Press's R4c guide cross-references it for the runtime-level handler mechanics and focuses on the Press side (`useDocumentOutput`, `useDocumentCompile`, `triggerDownload`, the preview pattern, etc.).

This is framework-level work, not Press restructure work. It probably wants its own small plan document at `kb/framework/plans/foundation-handlers.md` or similar — tracking it from the Press design doc means the relationship is visible but the work is fenced.

### Why this matters for Press's R4c docs

Press's phase R4c (public user-facing docs) includes a guide called `docs/guides/report-foundations.md` that walks a developer through building a report foundation end-to-end. That guide **cannot be written accurately** until the handlers discrepancies are resolved — the guide would either describe the design (and mislead readers whose foundations don't work), or describe the current code (and document a shape that's known to be wrong), or describe nothing concrete.

**This is framework-level work, not Press restructure work.** Flagging it here so it's tracked, and so R4c's exit criteria can include "handlers contract is settled in the framework." See §12 ("Not in this document") for the explicit out-of-scope entry and §10 for the risk.

### Citations — what Press explicitly does NOT do

The original doc has a dedicated section on citations. Summary of the decision: **neither Press nor Loom ships citation formatting.** Foundations that need bibliographies import `@citestyle/*` directly and use it at the component level. The reasons:

1. **Citation formatting needs structural output** (`{ text, html, parts, links }`) — not just string substitution. Template placeholders can't express "format this publication list with APA rules that depend on author count, date presence, container type." It's not a template problem.
2. **Citations look different in preview vs. docx.** Preview wants HTML with clickable DOIs; docx wants plain text with positional tabs. That's the JSX-and-register pattern already — a component builds both representations at once.
3. **Tree-shaking wins on the per-style-import model.** `import * as apa from 'citestyle/styles/apa'` keeps the foundation bundle small; only imported styles land in the output.

The citation pattern, per the original doc:

```jsx
import { format } from 'citestyle'
import * as apa from 'citestyle/styles/apa'
import { SafeHtml } from '@uniweb/kit'
import { useDocumentOutput } from '@uniweb/press'
import { H2, Paragraphs } from '@uniweb/press/docx'

export default function Publications({ block, content }) {
  const publications = content?.data?.publications || []
  const formatted = publications.map((pub) => format(apa, pub))

  const preview = formatted.map((entry, i) => (
    <SafeHtml key={i} as="li" value={entry.html} />
  ))

  const docxMarkup = (
    <>
      <H2>Publications</H2>
      <Paragraphs data={formatted.map((e) => e.text)} />
    </>
  )

  useDocumentOutput(block, 'docx', docxMarkup)

  return (
    <section>
      <h2>Publications</h2>
      <ol>{preview}</ol>
    </section>
  )
}
```

Note the separation: HTML preview from `entry.html`, plain text for docx from `entry.text` — both come from one `format()` call on the same data. This is the JSX-and-register pattern working exactly as intended: the preview shape and the document shape are the same source of truth expressed two ways.

**R4c gains a second new guide: `docs/guides/citations.md`.** It walks through the pattern above. Unlike the report-foundations guide, citations **don't** depend on handlers being resolved — the citation pattern works today, no framework-level prerequisites. This guide can be written at any time.

## 7. Dependency flow

Before:

```
press/src/sdk/instantiate.js     depends on   Loom's render() contract
press ────────────────────────────────────▶   (loom not a dependency)
```

Press didn't actually `import` Loom — `instantiateContent` took an `engine` argument with a duck-typed shape. So the "dependency" was implicit, which is worse than an explicit one because it was invisible to the package manifest.

After:

```
loom/src/prosemirror/instantiate.js            (owns the walker)
press                                          (no Loom awareness at all)

user code:
  const loom = new Loom()
  const resolved = instantiateContent(doc, loom, vars)
  // then pass `resolved` into Press components, or wherever
```

Press and Loom become genuinely independent. A foundation that uses Press for docx output but doesn't use Loom at all (no `{placeholder}` syntax anywhere) can do so cleanly. A foundation that uses Loom for content instantiation but doesn't produce documents never touches Press. Today both directions have accidental coupling.

## 8. Migration for existing code

No `@uniweb/press` consumers exist yet. No `@uniweb/loom` consumers exist yet (unpublished). **Clean break, no shims, no deprecation warnings.** We take the time to do principled architecture and test well — that's the explicit guidance from round 1.

The migration path is still worth documenting so future readers can reconstruct how the surface changed:

```js
// Before (phase 1)
import { DocumentProvider, DownloadButton, useDocumentOutput,
         Paragraph, H1, Image, Link } from '@uniweb/press/react'
import { instantiateContent, parseStyledString,
         makeCurrency, join } from '@uniweb/press/sdk'
import { htmlToIR, attributeMap } from '@uniweb/press'

// After (phase 1.6)
import {
  DocumentProvider,
  useDocumentOutput,
  useDocumentCompile,
  triggerDownload,
} from '@uniweb/press'
import { Paragraph, H1, Image, Link } from '@uniweb/press/docx'
import { instantiateContent } from '@uniweb/loom'
import { htmlToIR, attributeMap } from '@uniweb/press/ir'
// DownloadButton: no replacement — foundations write their own <button>
//   and call useDocumentCompile + triggerDownload.
// parseStyledString: no replacement (internal — use <Paragraph data="..."> API)
// makeCurrency, join, etc.: pending Q5 audit; either dropped or kept.
```

The split between "format-agnostic" imports (`DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`) from the root and "docx-specific" imports (`Paragraph`, `H1`, etc.) from `/docx` is the visible payoff of the symmetric partition: any foundation that does docx output has exactly two Press imports, one per concern. Foundations that add xlsx output gain a third: `import { Sheet, Row, Cell } from '@uniweb/press/xlsx'`.

Foundations migrating from the phase-1 `<DownloadButton>` to `useDocumentCompile` + `triggerDownload` gain the ability to do things other than download (preview, upload, email, etc.) and lose the ability to use a default button shape — which they would have replaced anyway.

## 9. Phased plan

Five phases, executed in order. Press is unpublished, so "phase" here means "logically separable unit of work the reviewer can check independently" — not "ships to users." We sequence small correctness checks first, then moves, then docs, then feature audit.

### Phase R1 — Correctness preflight

Smallest unit of work, done first so the bundle-analyzer workflow is in place before the main restructure lands.

- Remove `compileDocx`, `buildDocument` re-exports from `src/index.js`. (P3 fix.)
- Update the 1–2 tests that import `compileDocx` from the root to import from `src/docx/index.js` directly.
- Build a toy sandbox consumer (one-file foundation that imports `@uniweb/press` and `@uniweb/press/react`) and verify via Vite's build output that the `docx` library appears only in a dynamic chunk, not the main bundle. This gives us a working bundle-size verification recipe that R3 will reuse.

**Exit criteria:** `pnpm test` green. Toy consumer's main chunk does not contain the `docx` library.

R1 is a precondition for R3, not a standalone ship. It's useful on its own (fixes a real bug) but there are no consumers for whom that matters; the value is having a working verification setup and one fewer problem to hold in your head during the R3 diff review.

### Phase R2 — Loom gains `instantiateContent`

Move the Loom-adaptation code out of Press before touching Press's surface. Self-contained in the Loom repo.

- Create `loom/src/instantiate.js` — move `press/src/sdk/instantiate.js` verbatim. No behavior changes.
- Add `export { instantiateContent }` to `loom/src/index.js`.
- Move `press/tests/sdk/instantiate.test.js` to `loom/tests/instantiate.test.js`. The tests' mock engine already implements a Loom-shaped `render()` method — no changes needed. Consider also adding one test that uses a real `Loom` instance end-to-end, to exercise the integration.
- Update `loom/README.md`:
  - Add a new section (near "Custom JavaScript functions" or "See also") documenting `instantiateContent`.
  - Update the existing "See also" reference to `@uniweb/press/sdk` — it becomes a root `@uniweb/loom` export.
- Press `src/sdk/instantiate.js` is **not yet deleted** — that happens in R3. R2 ships Loom first so Press can depend on the new export before Press's own restructure.

Because Loom is unpublished (Q6), there's no version coordination to worry about. Workspace local dev uses `workspace:*` resolution — Press can depend on the updated Loom immediately after R2 lands.

**Exit criteria:** `loom/` tests green. Press's existing `instantiate.test.js` still runs (no Press changes yet).

### Phase R3 — Press surface restructure

The main event. After R2 lands.

#### R3 prep (before touching Press source)

- **Workspace-wide consumer grep.** Search Press for any external importers of `@uniweb/press/react`, `@uniweb/press/sdk`, or `parseStyledString`. Target paths: `framework/**`, `apps/**`, `platform/**`, and the reference report repos in Q4. We expect zero matches (phase 1 just shipped), but we need to confirm before deleting.
- **Internal utility audit (answers Q5).** Grep Press's own `src/` and `tests/` for uses of `makeCurrency`, `makeParentheses`, `makeRange`, and `join`. Grep the reference report repos too. Classify each hit: "replaceable by Loom stdlib," "genuinely useful as a JS helper," "unused." Decide delete vs. keep per function. If any stay, they move to a better-named home (no new `/sdk` subpath — probably internal helpers next to the builder that uses them, or a dedicated tiny helper file).
- **Adapter-lazy-load sanity check.** Write a small test consumer (one file, imports `@uniweb/press` + `@uniweb/press/docx`) and build it. Confirm the `docx` library only appears in a dynamic chunk, never in the main bundle. This gate prevents the new shape from regressing on P3 while we're restructuring.

#### R3 file moves and rewrites

Done as a single coordinated change. The `src/docx/` flip (adapter out, builders in) happens in one step — no intermediate name, no staged commit. Press is unpublished, so the diff's legibility matters less than the end state's correctness.

1. **Move the adapter out of `src/docx/`:** `src/docx/index.js` → `src/adapters/docx.js`. No code changes inside the file.
2. **Move the orchestrator into `src/ir/`:** `src/orchestrator/compile.js` → `src/ir/compile.js`. No code changes inside the file. Delete the now-empty `src/orchestrator/` directory.
3. **Move the React builders into `src/docx/`:** `src/react/components/*.jsx` → `src/docx/*.jsx`, *except* `Section.jsx`, which is **deleted** (18-line CSS wrapper, no docx pipeline interaction — see §5 "Why the old Section goes away"). Create `src/docx/index.js` as the new barrel that exports `Paragraph`, `Paragraphs`, `TextRun`, `H1`–`H4`, `Image`, `Images`, `Link`, `Links`, `List`, `Lists`. No `Section` export — the name is freed up for `@uniweb/press/sections` in R4a.
4. **Move `parseStyledString` into `src/docx/`:** `src/sdk/parseStyledString.js` → `src/docx/parseStyledString.js`. Update `src/docx/Paragraph.jsx`'s import path accordingly. `parseStyledString` is *not* exported from the `src/docx/index.js` barrel — it's a private helper.
5. **Flatten the format-agnostic files:** move `src/react/DocumentProvider.jsx`, `DocumentContext.js`, `useDocumentOutput.js` to the top of `src/` (alongside `index.js`). No intermediate `src/core/` or `src/provider/` directory.
6. **Split `DownloadButton.jsx` into two new top-level files and delete the button:**
   - Create `src/useDocumentCompile.js` — extract the hook logic from the old `useDocumentDownload`, but return `{ compile, isCompiling }` where `compile(format, documentOptions?)` returns a `Promise<Blob>` instead of triggering a download. The hook dynamic-imports the format adapter (`./adapters/docx.js` today; `./adapters/xlsx.js` in the future), walks the store via `compileOutputs` from `./ir/compile.js`, runs the adapter, and returns the blob. Does *not* call `triggerDownload`.
   - Create `src/triggerDownload.js` — extract the `triggerDownload(blob, fileName)` function from the old `DownloadButton.jsx` (currently a local helper at `src/react/DownloadButton.jsx:126-137`). Export as a plain function.
   - Delete `src/react/DownloadButton.jsx`. The button component itself is not preserved in any form.
7. **Rewrite `src/index.js`:** the root barrel exports `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`. No format-specific exports, no IR utilities, no button.
8. **Update `src/ir/index.js`** to export `htmlToIR`, `attributesToProperties`, `attributeMap`, and `compileOutputs`. The first three come from `./parser.js` and `./attributes.js` as today; `compileOutputs` now comes from `./compile.js` (moved in step 2). This makes `@uniweb/press/ir` a self-contained surface for custom-adapter authors.
9. **Update all the cross-file imports inside `src/ir/compile.js`** — the old `src/orchestrator/compile.js` imported `htmlToIR` from `../ir/parser.js`; after the move it's `./parser.js`.
10. **Delete `src/react/`** (now empty).
11. **Delete `src/sdk/`.** Per the Q5 audit outcome: delete or inline the utility functions; `instantiate.js` was already moved to Loom in R2; `parseStyledString.js` already moved in step 4 of this phase.
12. **Rewrite `package.json` `exports`:**
    ```json
    {
      "exports": {
        ".":       "./src/index.js",
        "./docx":  "./src/docx/index.js",
        "./ir":    "./src/ir/index.js"
      }
    }
    ```
    Note the absence of `/react`, `/sdk`, `/orchestrator`, or any public adapter path.

#### R3 test updates

- Update tests that import from `@uniweb/press/react` or `@uniweb/press/sdk` to import from the new locations.
- `tests/docx/index.test.js` imports from `../../src/docx/index.js` — update to `../../src/adapters/docx.js`.
- `tests/react/components.test.jsx` becomes `tests/docx/components.test.jsx` (or stays in place — cosmetic).
- `tests/react/provider.test.jsx` stays under `tests/react/` or moves to `tests/provider.test.jsx` at the top of `tests/` (cosmetic).
- `tests/react/download.test.jsx` tests the old `DownloadButton` component + `useDocumentDownload` hook. Both are gone in rev 4. Replace with new tests:
  - `tests/useDocumentCompile.test.jsx` — tests that `compile(format)` returns a Blob for a populated store, throws for unknown formats, and surfaces `isCompiling` correctly during async.
  - `tests/triggerDownload.test.js` — tests the no-op path in non-browser environments and that the `<a>` element is created, clicked, and removed in jsdom.
- Delete `tests/sdk/instantiate.test.js` (already copied to Loom in R2).
- Delete or inline `tests/sdk/parseStyledString.test.js` — merged into the component tests for `Paragraph`, since that's the only caller.
- Delete or keep `tests/sdk/utilities.test.js` based on Q5 audit outcome.

#### R3 preview-iframe demo and integration test

Anchoring the new API against the actual use case. Done as part of R3, not deferred — if the API can't express the preview-iframe flow cleanly, we need to know now, not after the restructure ships.

**`examples/preview-iframe/`** — a minimal runnable Vite app, one page, no styling polish. Structure:

```
examples/preview-iframe/
├── package.json           ← declares @uniweb/press as a workspace dep + docx-preview
├── vite.config.js         ← standard Vite config, React plugin
├── index.html
└── src/
    ├── main.jsx           ← ReactDOM root, mounts <App />
    └── App.jsx            ← the demo
```

`App.jsx` contains, in roughly 60 lines:

- A `DocumentProvider` wrapping everything
- Two or three `Section`-like components that each register their docx output via `useDocumentOutput(block, 'docx', markup)` — heading, paragraph, a small table. Uses the real `@uniweb/press/docx` builder primitives (`H1`, `Paragraph`, etc.)
- A `PreviewControls` component that holds a `useDocumentCompile` hook and exposes two buttons:
  - **Preview** — calls `compile('docx')`, then `renderAsync(blob, previewContainerEl)` from the `docx-preview` library to render the Blob into a DOM container
  - **Download** — calls `compile('docx')`, then `triggerDownload(blob, 'sample.docx')`
- A sandboxed preview `<iframe>` (or a plain container div — see "iframe vs. container" below) as the render target for docx-preview

The demo is runnable locally with `cd examples/preview-iframe && pnpm dev`. Not shipped as a Press export; not a dependency of Press itself. `docx-preview` is a dependency of the example's own `package.json`, not Press's.

**`tests/integration/preview-flow.test.jsx`** — the test counterpart. Does not actually render via docx-preview in jsdom (the library's DOM expectations are fragile outside a real browser), but verifies the structural guarantees the demo depends on:

- Given a `DocumentProvider` with two registered blocks, `compile('docx')` resolves to a Blob with non-zero size and the `PK` magic bytes (valid ZIP).
- `isCompiling` transitions `false → true → false` across the async call.
- Calling `compile` twice in sequence produces two distinct Blobs (no stale caching).
- `triggerDownload(blob, fileName)` is a no-op in a non-browser environment (tests run in jsdom but the function should gracefully handle `document === undefined`).

If we want to also verify docx-preview itself parses the Blob without throwing, that can go into a separate browser-mode test (Vitest browser mode or a Playwright harness) in phase R3 if the setup is cheap, or deferred otherwise.

**iframe vs. container.** `docx-preview`'s `renderAsync` renders into any DOM element — a `<div>` works fine. Using an `<iframe>` instead gives style and event isolation from the host page (the preview can't accidentally inherit the app's CSS or bubble scroll/click events up), which is valuable in a CMS context where the host has a lot of opinions. The demo uses an iframe because the user's actual use case is a CMS. Foundations that prefer a div can just swap the render target.

**Why this isn't a test-only thing.** A test verifies the pipeline produces a Blob. A runnable demo verifies that a human can actually see the Blob's content render as expected — fonts, tables, headers, pagination. Those are different kinds of confidence. The demo is where we'll catch adapter bugs that the Blob-validity test would miss (e.g., a table with broken XML that still has a valid ZIP envelope).

#### R3 exit criteria

- `pnpm test` green across all of Press.
- `pnpm test` green across all of Loom (unchanged by R3 but a regression check costs nothing).
- Toy sandbox foundation that imports from `@uniweb/press` and `@uniweb/press/docx` builds successfully via Vite.
- Bundle analyzer: `docx` library appears only in the dynamic chunk, not the main chunk.
- `Paragraph` builder component still parses `data="Hello <strong>World</strong>"` into styled text runs. (Catches any mis-wired `parseStyledString` import.)
- **The preview-iframe demo runs locally:** `cd examples/preview-iframe && pnpm install && pnpm dev`, then clicking "Preview" renders a visible document in the iframe, and clicking "Download" produces a `.docx` file that opens correctly in Word.
- **The integration test passes:** `pnpm test tests/integration/preview-flow.test.jsx`.

### Phase R4 — Section helpers, docs, kb cleanup

R4 is no longer a single documentation pass. Round-4 review expanded it into four explicit sub-phases, each independently reviewable: new code (R4a), Press internal docs (R4b), public user-facing docs (R4c), and kb cleanup (R4d). They run sequentially — R4a first because R4b–c describe R4a, then R4b, then R4c, then R4d.

#### Phase R4a — Section helpers (`@uniweb/press/sections`)

New subpath, two components. Built on top of the R3 surface, so strictly after R3 lands.

**Files:**

- `src/sections/index.js` — barrel exporting `Section` and `StandardSection`.
- `src/sections/Section.jsx` — the generic register-and-render wrapper. ~15 lines. Calls `useDocumentOutput(block, format, children)` and wraps children in `<section>`.
- `src/sections/StandardSection.jsx` — the opinionated Uniweb-content renderer. ~30 lines. Reads `block.content` (with optional override prop) and builds JSX with `H1`/`H2`/`H3`/`Paragraphs`/`Images`/`Links`/`Lists` from `../docx/`, then wraps in `<Section>`.
- `tests/sections/Section.test.jsx` — unit tests for `Section`: registers output, renders children, accepts `format` prop, accepts extra HTML props.
- `tests/sections/StandardSection.test.jsx` — unit tests for `StandardSection`: gracefully handles missing content fields, reads from `block.content` by default, accepts `content` override, registers under the format prop.
- `tests/integration/section-helpers.test.jsx` — an integration test that uses `StandardSection` inside a `DocumentProvider`, compiles to a Blob, and verifies the compiled output has the expected content (heading + paragraphs + images).

**`package.json` update:** add `"./sections": "./src/sections/index.js"` to the `exports` field.

**Exit criteria:**

- `pnpm test` green.
- Using `<StandardSection block={block} />` as the sole component of a test section produces a valid `.docx` Blob with heading, paragraphs, and images as registered.
- The preview-iframe demo (from R3) can be updated to use `<StandardSection>` in place of one of its hand-built sections without breaking anything — this is a structural check that the helper composes correctly with the rest of the API.

**Open question for R4a:** should `StandardSection` accept a `renderChildBlocks` prop in v1, or punt to v2? Leaning v2 (punt) — fewer props, less surface, easier to add later. But raise in round 5 review if there's strong reason to include it upfront.

#### Phase R4b — Press internal docs (CLAUDE.md + maintainer README)

The docs aimed at people working *on* Press, not people working *with* it. Focused, terse, fast.

- **Rewrite `press/CLAUDE.md`** — file layout, subpath exports, gotchas, references to `kb/framework/plans/press-package.md` (after R4d rename), references to this design doc, pointer to the preview demo and integration tests. This is a reference for Claude Code sessions, so it's allowed to be long and dense.
- **Rewrite `press/README.md`'s "Contributing" or "Development" section** if one exists (short — setup, test commands, how to add a builder component, how to add a format adapter). This is the maintainer-facing part of the README, separate from R4c which handles the user-facing part.
- **Verify no lingering references** to `/react`, `/sdk`, `DownloadButton`, `useDocumentDownload` in any internal doc or comment.
- **Regenerate any slash commands or skills** that reference old paths. None that I know of, but worth a grep.

R4b is cheap — maybe 2 hours of focused writing — but it unblocks R4c by ensuring the design is recorded internally before we commit to a public-facing narrative.

#### Phase R4c — Public user-facing docs

This is the big one. Round-4 review called out that Press has many things to explain to potential users and a one-hour README rewrite isn't adequate.

**Scope:** write Press's public documentation the way Loom has it (flat `docs/*.md` files referenced from the README, not a separate site). Follow Loom's organizational pattern as a template.

**Deliverables:**

```
press/
├── README.md                          ← rewrite: intro, hello world, pointers to docs/
└── docs/
    ├── concepts.md                    ← architecture, registration pattern, JSX-as-source-of-truth
    ├── quick-start.md                 ← hello world with preview + download
    ├── api/
    │   ├── core.md                    ← DocumentProvider, useDocumentOutput, useDocumentCompile, triggerDownload
    │   ├── docx.md                    ← every /docx builder component with examples
    │   ├── sections.md                ← Section, StandardSection, when to use which
    │   └── ir.md                      ← custom-adapter story via htmlToIR, compileOutputs, attributeMap
    ├── guides/
    │   ├── preview-pattern.md         ← iframe vs. container, docx-preview integration, pointer to the example
    │   ├── custom-adapter.md          ← how to build a non-docx format adapter using /ir
    │   ├── multi-block-reports.md     ← how DocumentProvider aggregates across multiple sections
    │   ├── report-foundations.md      ← NEW (rev 6). End-to-end: foundation.js handlers →
    │   │                                  Loom instance → instantiateContent → clean content →
    │   │                                  Press section components → useDocumentOutput →
    │   │                                  useDocumentCompile → preview/download. Depends on
    │   │                                  handlers contract being settled (see §6.5 and §12).
    │   └── citations.md                ← NEW (rev 6). The citestyle + Press pattern for
    │                                      bibliographies (per the original design doc). No
    │                                      framework prerequisites — can be written anytime.
    └── migration-from-phase-1.md       ← for readers holding phase-1 examples
```

Scope note: ~10–12 markdown files, estimated 1.5–2.5 days of focused writing. Not a one-hour appendix. Worth budgeting as such and not pretending otherwise.

**Writing rules** (carried from Loom's docs conventions):

- Lead with the use case, not the API.
- Every concept gets one runnable code example.
- Link sideways freely — `concepts.md` references `api/core.md` references `guides/preview-pattern.md`.
- Leave out things that aren't settled yet. Docs for xlsx and pdf don't exist until those adapters exist.
- The root README is an entry point, not a comprehensive reference. It has the intro, hello world, and pointers into `docs/`.

**Exit criteria:**

- All ten to twelve docs files exist and are internally consistent (no dead links).
- The README's hello world actually runs if copy-pasted into a Vite project.
- Every public export in §5's shape diagram is documented somewhere under `docs/api/`.
- A reader who has never heard of Press can go from the README through `quick-start.md` → `concepts.md` → `guides/preview-pattern.md` and have a working mental model.
- **`docs/guides/report-foundations.md` uses the final handlers contract**, meaning the framework-level handlers ambiguities in §6.5 have been resolved before R4c executes. See "Framework-level prerequisites for R4c" below. If the handlers contract is still unsettled when R4c starts, `report-foundations.md` is deferred and R4c ships without it.
- `docs/guides/citations.md` accurately mirrors the pattern in the original design doc's citation section.

#### Framework-level prerequisites for R4c

Rev 6 discovered that Press's `report-foundations.md` guide depends on framework-level decisions that are pre-existing and unresolved — they're out-of-scope for the Press restructure but they block the guide. Before R4c executes, one of two things must happen:

**Option 1 — Resolve upstream and write the guide.** Someone settles the three handlers discrepancies (foundation export shape, handler signature, `handlers.data` implementation) in the framework, updates `framework/cli/templates/foundation/src/foundation.js.hbs` with a handlers stub, and documents handlers in `framework/cli/partials/agents.md`. Then R4c writes `report-foundations.md` using the settled contract. This is the better outcome.

**Option 2 — Defer the guide and ship R4c without it.** R4c ships with ten of the eleven docs files. `report-foundations.md` is tracked separately and added later when the framework catches up. This keeps Press's restructure moving but leaves the primary use case undocumented.

My lean: Option 1, because the primary use case *is* report foundations. If we can't document them, we can't honestly call Press a public package for that audience. But this means "resolving handlers" becomes a prerequisite for R4c — not a task inside R4c, but something that has to be done in parallel, probably by Diego directly since it's framework-level.

I'll flag this as a new out-of-scope item in §12 and a new risk in §10.

#### Phase R4d — kb cleanup (answers Q7)

Round-1 review noted that some kb docs may be superseded and worth pruning. Round-2 review added the requirement that R4d gets its own review round before execution (Q9).

**Phase R4d — research step (no writes).** Read each of:

- `kb/framework/plans/documents-package.md` (576 lines) — the phase-1 plan. Much of this is still the authoritative record of *why* Press exists, *what* it replaces, and the heterogeneous-registration decision. Those parts stay. The phase-1 implementation notes and "decisions made in review" sections may be partially superseded by this restructure doc — identify which parts.
- `kb/framework/reference/documents-package-design.md` (48 lines) — likely the condensed design reference. Check whether it duplicates content now covered in this doc or the plan. If entirely redundant, delete and replace with a pointer.
- `kb/framework/reference/documents-legacy-references.md` (49 lines) — legacy code pointers. Probably still useful verbatim.

**Phase R4d — proposal step.** Produce a short proposal document (probably `press/docs/design/kb-cleanup-plan.md`) listing, per file: what to keep, what to cut, what to rename, what to redirect. Including the filename-rename question: the package was renamed from `@uniweb/documents` to `@uniweb/press` in commit `83343e7`, but the kb docs still use "documents" in their filenames. Candidate renames: `documents-package.md` → `press-package.md`, etc.

**Phase R4d — review step.** **Pause for review.** The user confirms or edits the proposal. No kb edits land before this confirmation. This isolates "planning what to cut" from "cutting it."

**Phase R4d — execution step.** Apply the approved proposal: rename files, consolidate content, delete duplicates, add redirects. After this, any reader starting from the kb index lands on current, non-duplicative information.

### Phase R5 — Legacy parity audit (after the restructure is stable)

Explicitly separated from the restructure because mixing "we changed the surface" with "we added features" would make either change hard to review. R5 is also the phase where we decide which capabilities to add *beyond* the legacy, since by then we have a clean surface to build on.

#### Reference foundations (from Q4)

Four legacy foundations, giving us both docx and xlsx coverage:

1. **Three docx reports** under `~/Uniweb/workspace/.assets/report-system/report-modules/src/` — the directory holds multiple faculty-report components. We'll walk them at R5 time to identify which three are the most feature-complete and pick the richest as the primary reference.
2. **`~/Proximify/innovation-modules/src/Publications/`** — the smoking-gun case from the kb plan: same component produces a Nivo chart preview *and* a flat `{ headers, data }` xlsx output via `block.xlsx`. Also does formatted publication lists. This is the reference for the xlsx registration pattern *and* for citation-heavy docx text.

Because xlsx adapter doesn't exist yet in Press, the Publications audit is split:
- The registration side (calling `useDocumentOutput(block, 'xlsx', { title, headers, data })`) can be exercised today — the core provider/hook don't care what format is registered, only the download step fails.
- The adapter side becomes the scoping document for phase 2's xlsx adapter (`@uniweb/press/xlsx`).

The docx audit proceeds in full against the three report-modules foundations.

#### Audit method

1. Pick the primary docx reference foundation (the richest of the three).
2. Port it mechanically to `@uniweb/press` + `@uniweb/press/docx`. No redesign — just change imports and adapt to any builder-component signature differences. Produce a Press output `.docx`.
3. Produce the legacy output `.docx` by running the original foundation in its original environment.
4. Diff the two `.docx` files at the XML level. Word documents are zip archives — unzip, extract `word/document.xml`, normalize whitespace and attribute order, diff.
5. Classify every XML-level discrepancy:
   - **Press missing feature** — legacy had it, Press doesn't support it.
   - **Press bug** — Press supports it but produces wrong output.
   - **Legacy quirk we don't want to replicate** — e.g., inconsistent spacing, hardcoded fonts.
   - **Intentional difference** — e.g., Press uses semantic defaults where legacy had explicit styling.
6. Repeat steps 2–5 for the other two docx reference foundations, but this time we're filling gaps in the punch list rather than starting from scratch.
7. For each "Press missing feature" hit: decide whether to fix in R5, defer to a named phase, or drop.
8. For the Publications foundation: audit the xlsx registration shape (what data gets passed to `useDocumentOutput`), document the shape decisions for phase 2's adapter, and audit the docx side for citation-specific features (italic journal names, et al., DOI hyperlinks, etc.).

#### Current feature gaps I can see from reading the adapter (pre-audit guesses)

Not a substitute for the actual audit. These are hypotheses to verify or falsify.

- **TextRun color, size, font family.** The adapter reads `bold`/`italics`/`underline`/`style` on text nodes (`src/docx/index.js:291-295` — will be `src/adapters/docx.js:...` after R3). Nothing reads `color`, `size`, `font`. If legacy report-sdk supported colored/sized text (and it probably did), we're missing it.
- **Section breaks and page setup.** The adapter emits exactly one `SectionType.CONTINUOUS` wrapping everything (`src/docx/index.js:86`). No page breaks between blocks, no landscape/portrait mixing, no page margin/size configuration. Legacy may have had explicit section-break support for multi-section documents.
- **Numbering style configuration.** The adapter reads `node.numbering.reference` on paragraphs, but the `Document` constructor is never passed `numbering: { config: [...] }`. This means the `reference` may not resolve to anything at runtime and numbered lists may render with Word's generic default numbering. Needs verification against a legacy numbered list.
- **Tab stops beyond `PositionalTab`.** Regular indentation tab stops aren't surfaced.
- **List nesting.** The `<List>` builder component exists (`src/react/components/List.jsx`) but I haven't read its implementation in depth. Nested bullet/numbered lists through IR-level `bullet.level` need a test.

#### Known phase-1.5 gaps from the original design doc (rev 6)

The original Press design doc (`.inbox/press-package.md`, §"Phase 1.5") named specific features that were planned but either not implemented or not verified. Rev 6 adds these to the R5 checklist explicitly. They're not speculation; they're known gaps from the source-of-truth design.

- **Paragraph `format` modes.** Legacy `report-sdk`'s `<Paragraph>` supported a `format` prop with at least five values: `twoColumnLayout`, `twoColumnLayoutWide`, `twoColumnLayoutJustified`, `twoLevelIndentation`, and `ordered-list-reversed`. These are layout patterns used by complex CV sections (e.g., two-column funding tables with date on the left and description on the right; ordered publication lists that count down from N). Current Press `Paragraph` has the `data` prop but no `format` prop. Verify against legacy, then decide per format mode: keep, extract to separate utility components, or drop as domain-specific.
- **Bookmark support in the docx adapter.** Legacy `docxGenerator.js` emitted `Bookmark` elements for internal cross-references. Current Press adapter doesn't. Low priority unless a reference foundation uses them.
- **`addSectionSpacing` config option.** Legacy had a per-document config for inter-section spacing. Current Press doesn't. Low priority; can be added via the `options` parameter to `compileDocx` when a foundation needs it.
- **`applyTo` orchestrator wiring.** The registration API accepts `{ role: 'header', applyTo: 'first' }` but the orchestrator currently ignores `applyTo` and just classifies by `role`. Headers/footers can be `first | all | odd | even`, and the adapter has `firstPageOnly` support, but the orchestrator doesn't wire them together. Fixing this unlocks proper first-page-cover-letter handling.

The R5 audit report (`press/docs/audits/2026-XX-legacy-parity.md`) captures per-gap decisions. Each gap resolves as "fix now," "defer to named phase," or "drop."

#### Beyond-legacy opportunities

During the audit, we track capabilities the legacy was weak in or missing entirely, and decide which to build now rather than deferring. Candidates (not decisions):

- **Native docx list numbering registration** — doing this *right* (not just using `reference` without a matching config) may be worth the upfront investment.
- **Auto-generated table of contents** via the `docx` library's TOC support. Legacy didn't have this.
- **Embedded charts via Recharts/Nivo → SVG → PNG.** The kb plan explicitly deferred this ("add complexity; defer until a foundation actually needs it"). By R5 we'll know whether Publications or the other foundations actually need it.
- **Corporate document themes** analogous to `theme.yml`: configurable fonts, colors, margins, header/footer content. This is latent in the adapter's `options` parameter but not surfaced in a coherent way. Worth thinking about once we see how many of the three reports share visual conventions.
- **Cross-foundation style presets.** If all three reports use the same heading styles and table conventions, a shared "preset" import would save foundation-level duplication.

The audit report (a new doc, probably `press/docs/audits/2026-XX-legacy-parity.md`) captures: the diff-level punch list, feature decisions (fix now / defer / drop), beyond-legacy decisions, and any adapter changes that land as part of R5.

#### R5 exit criteria

- At least one of the four reference foundations is successfully ported to Press with zero material XML diffs. ("Material" meaning: if Word opens both files they look the same; whitespace and attribute-order differences don't count.)
- A punch list exists for the other three with clear decisions on each item.
- The audit doc is committed to the repo.

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Unknown consumer depends on `/react` or `/sdk` | Very low (package is pre-1.0, just shipped, no external consumers per Q3) | N/A — clean break per Q3 | R3 prep step does the grep anyway to confirm. |
| `parseStyledString` used externally despite being an implementation detail | Very low | N/A per Q3 | Same grep sweep. |
| Bundle-size regression — repartitioning to `/docx` accidentally pulls adapter into main chunk | Medium | Real — 3.4 MB `docx` library | R3 prep step writes a toy consumer and verifies via bundle analyzer *before* the full R3 lands. R3 exit criteria repeat the check. |
| Moving `src/docx/` to `src/adapters/docx.js` while repurposing `src/docx/` for builders is confusing in diffs | Certain | Review friction | Consider staged commits in R3: first move the adapter to its new location (leaves old `src/docx/` empty), then populate new `src/docx/` with builders. Two reviewable steps rather than one massive rename. |
| `instantiateContent` tests need updates to match Loom's test conventions | Low | Small | Tests move verbatim; the walker doesn't care where it lives. R2 adds one new test using a real Loom instance for integration coverage. |
| Restructure reveals an architectural problem we didn't predict | Medium | Unknown | Phases are sequenced to land the smallest correct change first (R1) and the biggest surface change last (R3). R1 is standalone and lands independent of the rest. Any phase can be reverted without affecting later ones. |
| Q5 audit reveals a utility we can't cleanly drop but also can't cleanly house | Medium | Small — one file of helpers lives somewhere | If it happens: a small internal-only `src/utils.js` or similar. Avoid re-creating `/sdk` as a public surface. |
| `examples/preview-iframe/` demo bit-rots as Press's API evolves | Low-medium | Confuses readers; demo stops running | Add a smoke-test CI step (or a simple `pnpm build` in `examples/preview-iframe/` as part of R3 exit criteria) so breakage surfaces immediately. Cheaper than letting the demo diverge silently. |
| `docx-preview` rendering differs from Word's rendering in ways that give a false sense of fidelity | Medium | User sees something that looks right in preview but prints wrong | Frame the demo as "a preview," not "a WYSIWYG." Document the known limitations. R5 legacy parity audit is the place where actual fidelity is checked, not here. |
| **Framework-level handlers work not complete when R4c executes (rev 6, narrowed in rev 7)** | Medium | R4c's `report-foundations.md` guide can't be written accurately against the intended API. The rev-7 review narrowed the scope: the signature is already correct, but the `capabilities` nesting bug and the missing `handlers.data` both need fixing. | Tackle items 1 (fix nesting bug), 2 (`handlers.data` implementation), 3 (scaffold stub), and 4 (agents.md docs) from §6.5 "Framework-level work needed" before R4c starts. If deferred, R4c ships without `report-foundations.md` and tracks it separately. |

## 11. Open questions — round 1 resolutions

All seven questions from rev 1 have been answered. Summary:

- **Q1 — Subpath organization. Resolved: format-partitioned subpaths.**
  The original proposal put docx components under the default import with `/ir` as the only subpath. Round-1 review raised the concern that this creates asymmetry with future formats: when xlsx ships, docx builders live in the root but xlsx builders would live at `/xlsx`. Cleaner to partition by format from the start. Decision: `@uniweb/press` is the format-agnostic core (registration machinery), `@uniweb/press/docx` is the docx React primitives, `@uniweb/press/xlsx` and `@uniweb/press/pdf` follow the same pattern when they exist. The docx adapter (which pulls in the 3.4 MB `docx` library) stays at an internal path (`src/adapters/docx.js`) reached only via `useDocumentCompile`'s dynamic import, preserving the lazy-loading story. See §5 for the full shape.

- **Q2 — `instantiateContent` placement. Resolved: named root-level export from `@uniweb/loom`.**
  Not a subpath, not a method on the `Loom` class. Named import preserves engine-agnostic duck typing (critical if a future language engine ever needs to reuse the walker), keeps the class minimal, and requires no changes to the existing implementation. A subpath is unnecessary for one function; a method would lock the walker to Loom forever. See §6 for full reasoning.

- **Q3 — Back-compat shims. Resolved: no shims, clean break.**
  Nothing depends on Press in production. Nothing depends on Loom in production (unpublished, per Q6). Round-1 review explicitly confirmed: "we are not worried about back compat — we can take our time, do principled architecture, make any needed changes, test well." §8 now just documents the migration for future readers.

- **Q4 — R5 reference foundations. Resolved: four foundations.**
  Three docx reports at `~/Uniweb/workspace/.assets/report-system/report-modules/src/` plus `~/Proximify/innovation-modules/src/Publications/` (the xlsx + chart + citation case). §9 R5 documents the audit approach for each. Path conventions: these sibling repos live outside the workspace; the R5 audit will resolve them locally per machine.

- **Q5 — Fate of `makeCurrency/makeRange/makeParentheses/join`. Resolved: audit first, decide per function.**
  Round-1 review: "audit the situation first." Added as an R3 prep step in §9. Grep Press's own source and tests plus the four Q4 reference repos for each utility. Classify per function: replaceable by Loom stdlib, genuinely useful as JS helper, or unused. Delete the unused ones; either inline or relocate the useful ones (no new `/sdk` subpath).

- **Q6 — Loom versioning. Resolved: irrelevant.**
  Loom is unpublished. Ship whenever. Workspace `workspace:*` resolution means Press can depend on the updated Loom immediately after R2 lands. Dropped from the risk table in §10.

- **Q7 — kb doc updates. Resolved: in-place cleanup in R4, rename if appropriate.**
  Round-1 review raised the possibility that some kb docs are superseded and should be pruned. Added as an R4-kb sub-phase in §9. Read each of the three existing kb files (`documents-package.md`, `documents-package-design.md`, `documents-legacy-references.md`), identify duplication with this new restructure doc, consolidate or redirect, and rename from `documents-*` to `press-*` to reflect the package rename.

### Round 2 resolutions (Q8–Q10)

Round-2 review also answered the three calibration questions that emerged while writing rev 2:

- **Q8 — R3 filesystem flip. Resolved: one-step swap, no intermediate name.** Round-2 review clarified that Press is unpublished and has no external consumers. The diff's disorienting-ness ("the file called `docx/index.js` no longer exports `compileDocx`") is purely a cosmetic concern for the reviewer of the R3 PR, not an operational problem. One coordinated move, no staged commits, no temporary directory name. The end state is what matters.

- **Q9 — R4-kb review round. Resolved: yes, R4-kb gets its own review round.** See §9 R4-kb. The kb cleanup produces a proposal first, which gets reviewed and confirmed, then executes. No kb edits land before the proposal is approved. Isolates planning from execution.

- **Q10 — `src/core/` directory. Resolved: no directory. Format-agnostic files live at the top of `src/`.** Rev 3 flattens the layout: `DocumentProvider`, `DocumentContext`, `useDocumentOutput`, and (after rev 4's button removal) `useDocumentCompile` + `triggerDownload` sit directly under `src/` alongside `index.js`. Rationale:
  - Only four files — a directory is ceremony without payoff.
  - No nominal collision with `@uniweb/core`.
  - Matches the existing pattern where `src/index.js` lives at the top.

  Rev 3 also folds `src/orchestrator/compile.js` into `src/ir/compile.js`, since `compileOutputs` is functionally a member of the IR layer (it's the main consumer of `htmlToIR`). That eliminates the `src/orchestrator/` directory entirely and makes `/ir` a self-contained surface: parser, attribute map, and store-to-IR compiler in one directory.

All Q1–Q10 are now resolved.

### Round 4 — new topics (Q11–Q13)

Round-4 review introduced two new concerns that generated three new questions for round 5.

- **Q11 — Section helpers location. Resolved: `@uniweb/press/sections`.**
  Alternatives considered: `/uniweb` (circular naming), `/templates` (too vague), a separate `@uniweb/sdk` package (overkill for one component group). Settled on `/sections` because it describes what the components are (section-level templates), is symmetric with `/docx`, and doesn't commit the name to more than section templates. If the helper surface grows beyond section templates, we promote to a package — but not preemptively. See §5 "Section templates" for the full reasoning.

- **Q12 — Child-block handling in `StandardSection` v1. Open — leaning punt.**
  Legacy SMU `Section` recursed into `block.childBlocks` via `block.getChildBlockRenderer()`. Modern Uniweb has different child-block semantics (global `ChildBlocks` component, insets, prerender path). My lean is to *not* handle child blocks in `StandardSection` v1 — foundations that need recursion wrap `StandardSection` in their own component. Adding a `renderChildBlocks` prop in v2 is a non-breaking addition. But raise for round 5 if you have a strong preference either way.

- **Q13 — Public docs format. Open — leaning Loom-style flat `docs/*.md`.**
  Alternatives: Docusaurus site (heavy), integration into an existing Uniweb-wide docs site (coupling), flat markdown files in `docs/` (what Loom does). My lean is flat markdown. Loom's structure (`docs/basics.md`, `docs/language.md`, etc.) is a good template, and foundations browsing GitHub can read the docs without any build step. But if you have an existing Uniweb docs site that new packages are expected to integrate into, R4c should use that instead. Worth a minute of thought.

All other open questions are resolved. No round-5 blockers beyond Q12 and Q13.

## 12. Not in this document

Things that are real work but out of scope here, so we don't lose them:

- xlsx adapter design (phase 2 per the kb plan — still deferred).
- pdf adapter design (phase 3 — still deferred).
- Multi-page document assembly (`website.compileDocument({ pages, headers, footers })`).
- Charts-inside-docx via SVG → PNG embedding.
- Corporate document themes (analogous to `theme.yml`).
- A real-world port of a university foundation end-to-end — that happens in or after R5.
- **Foundation handlers resolution (rev 6, narrowed in rev 7).** The framework-level work to complete the handlers mechanism. Rev 7 resolved the handler signature (no change needed — current code is correct) and narrowed the remaining work to four concrete tasks:
  1. Fix the `capabilities` nesting bug — make the runtime read `foundation.default.handlers` directly, not `foundation.default.capabilities.handlers`.
  2. Implement `handlers.data` — mirrors `handlers.content` in `framework/core/src/block.js`, called after data attachment. Non-blocking but required for report foundations to do block-level data filtering.
  3. Add a commented scaffold stub for handlers in `framework/cli/templates/foundation/src/foundation.js.hbs`.
  4. Document handlers in `framework/cli/partials/agents.md`.

  Out of scope for the Press restructure but a prerequisite for R4c's `report-foundations.md` guide. Needs its own small plan document — my recommendation is `kb/framework/plans/foundation-handlers.md`. See §6.5 "Framework-level work needed" for the full punch list and §10 for the risk.

## 13. Appendix — files touched by this proposal

For reviewer navigation. Not code; just a map of where the work lands.

### Press (this package)

**R1 (correctness preflight):**
- `src/index.js` — remove `compileDocx`/`buildDocument` re-exports.
- `tests/docx/index.test.js` — possibly one import path update.

**R3 (main restructure):**
- `src/index.js` — rewrite to export the format-agnostic four: `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`.
- `src/DocumentProvider.jsx`, `DocumentContext.js`, `useDocumentOutput.js` — moved to the top of `src/` from `src/react/`. No intermediate directory.
- `src/useDocumentCompile.js` — NEW. Hook extracted from the old `src/react/DownloadButton.jsx` `useDocumentDownload` logic. Returns `{ compile, isCompiling }`; `compile(format, options?)` returns `Promise<Blob>` (does not trigger download).
- `src/triggerDownload.js` — NEW. DOM utility extracted from the old `src/react/DownloadButton.jsx` `triggerDownload` local helper. Standalone function, not a hook.
- `src/react/DownloadButton.jsx` — DELETED. The button component is not preserved in any form.
- `src/useDocumentCompile.js` — dynamic-import path for adapters uses `./adapters/docx.js` (and future `./adapters/xlsx.js`, etc.).
- `src/docx/` — REPURPOSED. Previously held the adapter; now holds builder components. New `index.js` barrel exports `Paragraph`, `TextRun`, `H1`–`H4`, `Image`, `Link`, `List`, `Section`, and their `Paragraphs`/`Images`/`Links`/`Lists` convenience wrappers.
- `src/docx/Paragraph.jsx`, `TextRun.jsx`, `Headings.jsx`, `Image.jsx`, `Link.jsx`, `List.jsx`, `Section.jsx` — moved from `src/react/components/`.
- `src/docx/parseStyledString.js` — moved from `src/sdk/parseStyledString.js`, internal helper next to its caller.
- `src/docx/Paragraph.jsx` — one import path fix (`../../sdk/parseStyledString` → `./parseStyledString`).
- `src/adapters/docx.js` — NEW. Moved from the old `src/docx/index.js`. Internal, reached via `useDocumentCompile`'s dynamic import.
- `src/ir/compile.js` — moved from `src/orchestrator/compile.js`. One import path fix inside (`../ir/parser.js` → `./parser.js`).
- `src/ir/index.js` — extended to re-export `compileOutputs` from `./compile.js`.
- `src/orchestrator/` — deleted entirely (folded into `src/ir/`).
- `src/react/` — deleted entirely.
- `src/sdk/` — deleted entirely (per Q5 audit outcome and this phase's file moves).
- `package.json` — `exports` field rewritten: `.`, `./docx`, `./ir`. No `./react`, `./sdk`, `./orchestrator`, or public adapter path.
- `tests/` — subdirectory moves and deletions per §9 R3.
- `tests/integration/preview-flow.test.jsx` — NEW. Exercises the `compile` → Blob → download path end-to-end. Does not render via docx-preview (jsdom fragility) but asserts Blob validity, compiling-state transitions, and cache isolation between successive compiles.
- `examples/preview-iframe/` — NEW directory. Runnable Vite app demonstrating the compile + preview + download flow using `docx-preview`. Includes `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`. Declared as a non-published workspace package; not a dependency of Press itself. The `docx-preview` library lives in the example's `package.json`, not Press's.

**R4a (section helpers):**
- `src/sections/index.js` — NEW barrel.
- `src/sections/Section.jsx` — NEW. Generic register-and-render wrapper (~15 lines).
- `src/sections/StandardSection.jsx` — NEW. Opinionated Uniweb-content renderer (~30 lines).
- `tests/sections/Section.test.jsx` — NEW.
- `tests/sections/StandardSection.test.jsx` — NEW.
- `tests/integration/section-helpers.test.jsx` — NEW. Uses `StandardSection` in a compile flow.
- `package.json` — `exports` field gains `./sections`.
- `examples/preview-iframe/src/App.jsx` — optionally updated to demo `<StandardSection>` alongside hand-built sections.

**R4b (Press internal docs):**
- `CLAUDE.md` — rewrite file layout, subpath exports, gotchas, cross-references.
- `README.md` — update any "Contributing" or "Development" section (R4b) — the user-facing intro is R4c.

**R4c (public user-facing docs):**
- `README.md` — rewrite intro, hello world, pointers to `docs/`.
- `docs/concepts.md` — NEW.
- `docs/quick-start.md` — NEW.
- `docs/api/core.md` — NEW.
- `docs/api/docx.md` — NEW.
- `docs/api/sections.md` — NEW.
- `docs/api/ir.md` — NEW.
- `docs/guides/preview-pattern.md` — NEW.
- `docs/guides/custom-adapter.md` — NEW.
- `docs/guides/multi-block-reports.md` — NEW.
- `docs/guides/report-foundations.md` — NEW (rev 6). Depends on framework handlers contract being settled; see §9 R4c "Framework-level prerequisites" and §12.
- `docs/guides/citations.md` — NEW (rev 6). No prerequisites; follows the original design doc's citation pattern.
- `docs/migration-from-phase-1.md` — NEW.

**R4d (kb cleanup):**
- `press/docs/design/kb-cleanup-plan.md` — NEW (the pre-execution proposal, reviewed per Q9).
- `kb/framework/plans/documents-package.md` — consolidated, renamed to `press-package.md`, or redirected.
- `kb/framework/reference/documents-package-design.md` — ditto.
- `kb/framework/reference/documents-legacy-references.md` — ditto.

### Loom (sibling package)

**R2:**
- `src/instantiate.js` — NEW. Moved from `press/src/sdk/instantiate.js`.
- `src/index.js` — gains `export { instantiateContent }`.
- `tests/instantiate.test.js` — NEW. Moved from `press/tests/sdk/instantiate.test.js`, plus one new test using a real Loom instance.
- `README.md` — add `instantiateContent` section, update Press cross-reference.

### Knowledge base (R4)

- `kb/framework/plans/documents-package.md` — in-place update to reflect phase-1.6. Possibly rename to `press-package.md` (Q7).
- `kb/framework/reference/documents-package-design.md` — check for duplication, consolidate or redirect.
- `kb/framework/reference/documents-legacy-references.md` — likely minor updates (package rename).
- New: `press/docs/audits/2026-XX-legacy-parity.md` — the R5 audit report.

---

## 14. Review checklist for round 7

Revision 7 resolves the handlers signature (correct as-is), confirms the `capabilities` nesting is a real bug, and confirms `handlers.data` is genuinely missing with no hidden alternative in `DataStore`/`EntityStore`. The framework-level work list is now concrete in §6.5. No rev-6 decisions were overturned.

**Rev 7 items — need confirmation:**

- [ ] §6.5 "Framework-level work needed" punch list — is items 1–4 the right priority order? Is item 2 (`handlers.data` implementation) really non-blocking, or is it closer to critical given that the primary report foundations do block-level filtering?
- [ ] §6.5 "DataStore named transforms" comparison — accurate to how you understand the two mechanisms? In particular: is there any case where a DataStore transform *could* substitute for `handlers.data` by using the fetch config to pass block-level params? I don't see how, but it's worth a sanity check from someone who knows the fetch config pipeline better than I do.
- [ ] §12 out-of-scope — should the foundation-handlers plan live at `kb/framework/plans/foundation-handlers.md` or somewhere else in the kb? Naming preference?
- [ ] §10 risk severity — I dropped it from medium-high to medium after rev 7's narrowing. Feels right?

**Still-open questions from earlier rounds:**

- [ ] Q12 — child-block handling in `StandardSection` v1: punt to v2, or include `renderChildBlocks` prop upfront?
- [ ] Q13 — public docs format: flat `docs/*.md` like Loom, or integrate into a Uniweb-wide docs site?

**Plan cohesion:**

- [ ] Walk §9 R1 → R2 → R3 → R4a → R4b → R4c → R4d → R5 in order. Does each phase leave the codebase in a coherent state?
- [ ] §5 — does the §5 file layout diagram match every reference to `src/` paths in §9 R3, R4a, §13, and elsewhere?
- [ ] §9 R5 — out-of-workspace reference foundation paths. Are they correct?

**Doc quality (carried from round 6):**

- [ ] Seven revision rounds in. **My recommendation**: consolidate before execution. The doc is ~1,400 lines now and the revision history + inline rev-X cross-references make it hard to read linearly. I can produce a clean final draft that strips the revision history to a one-paragraph summary, inlines all Q-resolutions and rev-X notes into the relevant sections, and reads as a forward-looking plan. Probably ~700 lines. The existing doc becomes `restructure-2026-04-revision-history.md` (if we want to preserve the conversation) or gets deleted (if git history is enough). Say the word.
- [ ] Should `.inbox/press-package.md` be moved out of `.inbox/` (gitignored) into a permanent location like `press/docs/design/historical/original-press-package-design.md` since rev 6+ reference it as a source of truth? Strongly recommend yes — a design doc referencing a gitignored file will silently rot.

**Ready to execute?** If round 7 resolves Q12, Q13, and confirms the §6.5 priority order, R1 can start in the next conversation. The framework-handlers work (items 1–4) can run in parallel with R1/R2/R3 since it doesn't touch Press source, and needs to complete before R4c.

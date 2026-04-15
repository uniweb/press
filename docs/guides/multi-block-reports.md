# Multi-block reports

How `DocumentProvider` aggregates output across multiple section components into one document, what order things come out in, and what happens when sections mount and unmount.

## One provider, many sections

A real report is never one section. It's a cover, a summary, some data tables, a conclusion, maybe a signature block. Press handles this with a single `<DocumentProvider>` wrapping the whole page:

```jsx
import { DocumentProvider } from '@uniweb/press'

function AnnualReport({ blocks }) {
    return (
        <DocumentProvider>
            <Cover block={blocks.cover} />
            <Summary block={blocks.summary} />
            <ResearchFunding block={blocks.funding} />
            <Publications block={blocks.publications} />
            <Conclusion block={blocks.conclusion} />
            <DownloadControls />
        </DocumentProvider>
    )
}
```

Every section component calls `useDocumentOutput(block, 'docx', markup)` from its own render. The provider holds a `WeakMap<block, Map<format, entry>>` plus a parallel array that preserves registration order. When `compile('docx')` runs, the store is walked in that order and each entry is compiled.

## Registration order is render order

Sections appear in the compiled document in the order they first register. Since registration happens from inside `useDocumentOutput`, which is called during React's render, the order matches the order React renders components — which is depth-first, children before siblings.

```jsx
<DocumentProvider>
    <Cover block={a} />      {/* registers first */}
    <Summary block={b} />    {/* registers second */}
    <Findings block={c} />   {/* registers third */}
</DocumentProvider>
```

The compiled `.docx` contains cover, summary, findings in that order.

**Conditional sections** that mount later register later:

```jsx
<DocumentProvider>
    <Cover block={a} />
    {showSummary && <Summary block={b} />}
    <Findings block={c} />
</DocumentProvider>
```

When `showSummary` is `false`, the document has cover and findings. When it's `true`, the summary appears between them — *unless* it was previously mounted and then remounted, in which case it appears at the end. See "Unmount and remount" below.

## How re-registration works

If the same block re-registers under the same format (Strict Mode double-render, state changes that cause a section to re-render, concurrent rendering), the second call **overwrites** the first entry. The block's position in registration order does *not* move — it stays where it was the first time.

```js
// Inside the provider store:
register(blockA, 'docx', markup1)  // blockOrder: [blockA]
register(blockB, 'docx', markup2)  // blockOrder: [blockA, blockB]
register(blockA, 'docx', markup3)  // blockOrder: [blockA, blockB] — A stays first
```

Two consequences:

- **Content updates are cheap.** A section whose content changes re-renders, re-registers its new markup, and the new markup replaces the old at the same position. No reordering, no duplicates.
- **Strict Mode is safe.** React 18/19 Strict Mode intentionally double-invokes every render in development. The second call overwrites the first with identical content. The final store state is the same as a single render would have produced.

## Unmount and remount

When a section unmounts, its entry **stays in the WeakMap** until the block itself is garbage-collected. If you're using stable block objects (held by a parent component or a store), the entry persists across unmounts.

This is usually what you want: a section that was briefly toggled off should reappear in its original position when toggled back on. But it has a subtlety:

```jsx
const [showSummary, setShowSummary] = useState(true)
// ... register blockA, blockB (Summary's block), blockC
// User toggles off:
setShowSummary(false)
// Summary unmounts. blockB's entry is still in the WeakMap.
// Registered order: [blockA, blockB, blockC]
// Compiled order when user clicks Download: cover, summary, findings.
// User re-toggles on, then off again.
// blockB re-registers at the same position. No change.
```

vs.

```jsx
// Same setup, but blockB is a newly created object each render:
<Summary block={{ id: 'summary' }} />
```

Every render creates a *new* `{ id: 'summary' }` object. To the provider, this is a different block. The old one becomes garbage, its entry becomes eligible for GC, and the new one registers at the end of the order array. The compiled document's section order changes every render. **This is almost certainly a bug.** Create stable blocks once and pass them down.

## Section roles: body, header, footer

`useDocumentOutput` accepts an `options.role` of `'body'` (default), `'header'`, or `'footer'`. Header and footer registrations are compiled into the docx document's page header and footer; body registrations become the main content.

```jsx
function Header({ block }) {
    const markup = (
        <Paragraph>
            Annual Report 2025 — page <TextRun>_currentPage</TextRun>
        </Paragraph>
    )
    useDocumentOutput(block, 'docx', markup, { role: 'header' })
    // The header doesn't render visibly in the preview since it's
    // intended for the compiled file only.
    return null
}
```

Multiple header registrations merge — last one wins. Same for footers. If you need conditional per-page headers (e.g., a cover-letter header for the first page, a plain one for subsequent pages), register two with `applyTo: 'first'` and `applyTo: 'all'` on the respective entries. *Today only `all` and `first` are honored by the docx adapter; odd/even are in the roadmap.*

The docx adapter also provides a default "Page X of Y" footer if no footer is registered. That default disappears the moment any footer registration lands.

## Multiple formats from the same tree

The `format` argument to `useDocumentOutput` is an arbitrary string. A section can register for more than one format:

```jsx
function Findings({ block, content }) {
    const docxMarkup = (
        <>
            <H2>Findings</H2>
            <Paragraphs data={content.paragraphs} />
        </>
    )
    useDocumentOutput(block, 'docx', docxMarkup)

    // Hypothetical xlsx-aware section:
    useDocumentOutput(block, 'xlsx', {
        title: 'Findings',
        headers: ['Finding', 'Year', 'Impact'],
        data: content.tableRows,
    })

    return <section>{docxMarkup}</section>
}
```

Compile them independently:

```jsx
const docxBlob = await compile('docx')
const xlsxBlob = await compile('xlsx')
```

The docx compile only walks docx registrations; the xlsx compile only walks xlsx registrations. Sections that don't register under a format are simply absent from that format's output.

## Multiple providers in the same tree

Providers don't merge. Each `<DocumentProvider>` owns its own store, and `useDocumentOutput` registers into the *nearest* enclosing provider:

```jsx
<DocumentProvider>            {/* provider A */}
    <Cover block={a} />
    <DocumentProvider>        {/* provider B, nested */}
        <Details block={b} />
    </DocumentProvider>
    <Conclusion block={c} />
</DocumentProvider>
```

Provider A's store has `[blockA, blockC]`. Provider B's store has `[blockB]`. Compiling from A's context produces a document with cover and conclusion. Compiling from B's context produces a document with just details.

This lets you build nested document scopes — a master report that contains sub-reports, each compiled separately — but it also means a compile call you expect to include a section won't if that section is wrapped in its own provider. A helpful rule of thumb: **only one provider per user-visible "this compiles to one file" scope.**

## Gotchas worth remembering

- **Blocks should be stable.** Create them once and hold them. New objects every render = new registrations every render = document that reorders under your feet.
- **Don't call `useDocumentOutput` conditionally.** It's a React hook — call it unconditionally from every render, or wrap the whole component in a conditional. `if (shouldRegister) useDocumentOutput(...)` violates the rules of hooks.
- **Registration is synchronous during render.** Side-effect is intentional — the store must be up to date before any compile call that happens in the same tick. Don't move registration into `useEffect`; the compile pipeline reads the store immediately after render and would miss entries that haven't flushed yet.
- **Compilation is async.** `compile` returns a Promise. If a user triggers two downloads in quick succession, both compiles race; whichever resolves last wins in any state you're tracking (cached Blob, last-compiled-at timestamp). Either disable the button while `isCompiling` is `true` (default behavior in the [preview pattern guide](./preview-pattern.md)) or debounce at the app level.

## See also

- **[Core API reference](../api/core.md)** — `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile` in detail.
- **[Concepts](../concepts.md)** — the registration pattern and why registration happens during render.
- **[The preview pattern](./preview-pattern.md)** — the typical single-compile-two-uses flow.

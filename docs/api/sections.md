# `@uniweb/press/sections` — section templates

Higher-level helpers that combine registration and rendering in one call, and an opinionated content-shape renderer built on top. Two components.

```js
import { Section, StandardSection } from '@uniweb/press/sections'
```

## Read this first — `/sections` is primarily for non-Uniweb contexts

The `/sections` helpers each render their own `<section>` element. That's useful when:

- You're building a **standalone React app** that uses Press directly (like the [`examples/preview-iframe/`](../../examples/preview-iframe/) demo) — there's no outer runtime wrapping your components, and you need to emit a `<section>` yourself for each section-like block.
- You're building a **non-Uniweb React component library** that uses Press for downloadable outputs — same story.

In a **Uniweb foundation**, the runtime already wraps every section component in `<section>` with the correct context class and background. Using `<Section>` or `<StandardSection>` inside a Uniweb section component would produce a nested `<section><section>…</section></section>`, which is almost never what you want. Instead, call `useDocumentOutput` directly from inside your component and return your own layout — see [the quick-start guide](../quick-start.md) and [`/core`](./core.md).

If you're already reading this page because you want the boilerplate reduction `<Section>` and `<StandardSection>` provide, the right answer in a Uniweb foundation is a small helper of your own — a 3-to-5-line function that takes `{ content, block }`, calls `useDocumentOutput`, and returns the layout you want. Press deliberately does not ship a Uniweb-specific version of these helpers, because doing so would bake assumptions about Kit usage and content rendering into a framework that is supposed to stay format-focused.

With that out of the way, here's what `/sections` actually does.

## `<Section>`

Generic register-and-render wrapper. Zero content knowledge. Format-agnostic.

```jsx
import { Section } from '@uniweb/press/sections'
import { H1, Paragraph } from '@uniweb/press/docx'

function Cover({ block, content }) {
    return (
        <Section block={block}>
            <H1>{content.title}</H1>
            <Paragraph>{content.body}</Paragraph>
        </Section>
    )
}
```

This is equivalent to:

```jsx
function Cover({ block, content }) {
    const markup = (
        <>
            <H1>{content.title}</H1>
            <Paragraph>{content.body}</Paragraph>
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
}
```

The helper saves the `markup`-const dance. The `children` you pass to `<Section>` are rendered inside a `<section>` element for preview *and* registered for compilation — one call, two purposes.

Props:

- **`block`** — WeakMap key for the registration. Same semantics as `useDocumentOutput`'s `block` argument.
- **`format`** — output format identifier. Default `'docx'`. Use `'xlsx'` (when the toolkit lands) or a custom format string to register under a different key.
- **`children`** — the JSX to render *and* the fragment to register. Exactly the same React subtree is used for both.
- **`...rest`** — any other props are forwarded to the rendered `<section>` element. `className`, `id`, `style`, event handlers — everything works as if you'd written a plain `<section>`.

```jsx
<Section block={block} className="cover page-break-before" id="cover">
    …
</Section>
```

## `<StandardSection>`

An opinionated renderer for Uniweb's standard content shape. Reads `title`, `subtitle`, `description`, `paragraphs`, `images`, `links`, and `lists` from the block's content and renders them through `/docx` builders in a conventional order.

```jsx
import { StandardSection } from '@uniweb/press/sections'

function Fallback({ block }) {
    return <StandardSection block={block} />
}
```

With a block whose content is shaped like:

```js
{
    id: 'cover',
    content: {
        title: 'Annual Report',
        subtitle: 'Fiscal Year 2025',
        description: 'Prepared by the Research Office',
        paragraphs: [
            'The past year saw steady growth across all regions.',
            'Refereed output rose twelve percent year over year.',
        ],
        images: [{ url: '/cover.png', alt: 'Cover' }],
        links: [{ label: 'Research Office', href: 'https://example.edu' }],
        lists: [[{ paragraphs: ['Milestone one'] }, { paragraphs: ['Milestone two'] }]],
    },
}
```

…`<StandardSection>` emits the equivalent of:

```jsx
<Section block={block}>
    <H1 data="Annual Report" />
    <H2 data="Fiscal Year 2025" />
    <H3 data="Prepared by the Research Office" />
    <Paragraphs data={…} />
    <Images data={…} />
    <Links data={…} />
    <Lists data={…} />
</Section>
```

Note that `<StandardSection>` uses `description` rather than Uniweb's standard `pretitle`, and doesn't read `items`, `icons`, `videos`, or `data`. It's a minimal opinionated renderer, not a complete mapping of Uniweb's content shape. A full Uniweb-aware renderer is a foundation-level concern — build one in your foundation's `src/components/` if you want the complete picture.

Props:

- **`block`** — the block to register under.
- **`content`** — optional override. Defaults to `block?.content`. Pass `content={someOverride}` if your content shape is computed separately (e.g., you aggregated items into paragraphs).
- **`format`** — output format. Default `'docx'`. Forwarded to the underlying `<Section>`.
- **`renderChildBlocks`** — optional function `(block) => ReactNode`. Called after the standard fields render so foundations can append child-block recursion. Typically wired to kit's `<ChildBlocks>`:

    ```jsx
    import { ChildBlocks } from '@uniweb/kit'

    <StandardSection
        block={block}
        renderChildBlocks={(b) => <ChildBlocks from={b} />}
    />
    ```

    `StandardSection` itself does *not* import from `@uniweb/kit` — coupling Press to Uniweb-specific rendering would break the duck-typing story. A non-Uniweb caller can pass any other function that makes sense in their context, or omit the prop entirely.

### Missing fields

`StandardSection` gracefully handles missing content fields, empty content objects, and even a block with no `content` at all. Missing title/subtitle/description skip their heading, empty arrays skip their builder, and a section with nothing to render simply emits an empty `<section>`. It never throws.

```jsx
<StandardSection block={{ id: 'blank' }} />
// → <section></section>  (no error)
```

### Duck typing is on purpose

`StandardSection` reads `content.title`, `content.paragraphs`, etc. directly. It does not import from `@uniweb/core`, does not check if `block` is a Uniweb `Block` instance, and makes no assumptions about where the content shape came from. A non-Uniweb React project that produces a similar shape gets `StandardSection` for free. This is part of keeping `/sections` usable outside Uniweb — which, per the note at the top of this page, is really what this subpath is for.

## See also

- **[Core API](./core.md)** — the primitives (`DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`) that Uniweb foundations typically use directly, without `/sections`.
- **[/docx reference](./docx.md)** — the builder components `StandardSection` uses internally.
- **[Quick start](../quick-start.md)** — the recommended pattern for Uniweb foundations (register via `useDocumentOutput`, return your own layout, let the runtime provide the outer `<section>`).
- **[Multi-block reports](../guides/multi-block-reports.md)** — how multiple sections compose into one document regardless of which helper they use.
- **[`examples/preview-iframe/`](../../examples/preview-iframe/)** — the runnable demo, which is the canonical non-Uniweb context where `<Section>` and `<StandardSection>` shine.

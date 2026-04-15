# `@uniweb/press/sections` — section templates

Higher-level helpers that remove the register-and-render boilerplate every foundation otherwise writes by hand. Two components, layered from generic to opinionated.

```js
import { Section, StandardSection } from '@uniweb/press/sections'
```

Both are optional. Everything the `/sections` subpath offers can also be done directly with `useDocumentOutput` and `/docx` builders. Use these helpers when you want less ceremony; reach past them when you need control they don't expose.

## `<Section>`

The generic register-and-render wrapper. Zero content knowledge. Format-agnostic.

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
- **`format`** — output format identifier. Default `'docx'`. Use `'xlsx'` (when the adapter lands) or a custom format string to register under a different key.
- **`children`** — the JSX to render *and* the fragment to register. Exactly the same React subtree is used for both.
- **`...rest`** — any other props are forwarded to the rendered `<section>` element. `className`, `id`, `style`, event handlers — everything works as if you'd written a plain `<section>`.

```jsx
<Section block={block} className="cover page-break-before" id="cover">
    …
</Section>
```

## `<StandardSection>`

An opinionated renderer for Uniweb's standard content shape. Reads `title`, `subtitle`, `description`, `paragraphs`, `images`, `links`, and `lists` from the block's content and renders them through `/docx` builders in a conventional order. Eliminates the heading-paragraphs-images-links-lists boilerplate that every foundation otherwise rewrites per section.

```jsx
import { StandardSection } from '@uniweb/press/sections'

function Fallback({ block }) {
    return <StandardSection block={block} />
}
```

With a block shaped like:

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

…`<StandardSection>` emits:

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

Props:

- **`block`** — the block to register under.
- **`content`** — optional override. Defaults to `block?.content`. Pass `content={someOverride}` if your content shape is computed separately.
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

This is deliberate. A report that conditionally includes a section based on content availability should be able to drop the content without defensively guarding the call.

### When to use it

`<StandardSection>` is the modern equivalent of the legacy SMU `Section` from the old report-sdk, minus the `block.output` mutation and minus the hand-rolled `htmlToDocx` call. Use it when:

- Your section content fits the standard shape (`title`, `subtitle`, `paragraphs`, `images`, `links`, `lists`).
- You want a sensible default for new or low-priority sections.
- You're porting an SMU section that used the legacy helper.

Skip it when:

- Your section is a visualization (table, chart, citation list) that doesn't match the standard shape.
- You need a specific rendering order that isn't heading → paragraphs → images → links → lists.
- You want to interleave custom content between the standard fields.

In those cases, use `<Section>` (to keep the register-and-render convenience) or go direct with `useDocumentOutput` + `/docx` builders.

### Duck typing is on purpose

`StandardSection` reads `content.title`, `content.paragraphs`, etc. directly. It does not import from `@uniweb/core`, does not check if `block` is a Uniweb `Block` instance, and makes no assumptions about where the content shape came from. A non-Uniweb React project that produces the same shape gets `StandardSection` for free. This is part of keeping Press usable outside the Uniweb framework.

## See also

- **[Core API](./core.md)** — the primitives (`DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`) that `/sections` builds on.
- **[/docx reference](./docx.md)** — the builder components `StandardSection` uses internally.
- **[Multi-block reports guide](../guides/multi-block-reports.md)** — when you have many sections, what order they compile in and how to mix `Section`, `StandardSection`, and hand-written sections in the same document.

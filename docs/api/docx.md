# `@uniweb/press/docx` — builder components

React components for describing document content. They emit ordinary JSX with `data-*` attributes that encode docx-specific concerns (heading levels, borders, spacing, image transforms, hyperlinks). The same JSX renders as the browser preview and is walked to produce the downloaded `.docx` file.

```js
import {
    Paragraph,
    Paragraphs,
    TextRun,
    H1, H2, H3, H4,
    Image, Images,
    Link, Links,
    List, Lists,
} from '@uniweb/press/docx'
```

Importing from `@uniweb/press/docx` does **not** pull the ~3.4 MB `docx` library into your bundle. That library lives in the format adapter and is loaded dynamically the first time `compile('docx')` runs.

## `<Paragraph>` and `<Paragraphs>`

The most common builder. Renders a block-level text container.

```jsx
<Paragraph>Plain text with no marks.</Paragraph>

<Paragraph data="Awarded in <strong>2004</strong> with <em>honors</em>." />

<Paragraph as="div">
    Use the <code>as</code> prop to change the rendered HTML element.
</Paragraph>
```

Props:

- **`data`** — optional string. If present, the string is parsed for inline marks (`<strong>`, `<b>`, `<em>`, `<i>`, `<u>`) and rendered as a sequence of styled `<TextRun>` children. If absent, the component renders `children` directly.
- **`as`** — optional tag name (default `'p'`). Use `as="div"` when you want an HTML block that isn't a `<p>` — most commonly inside the table pattern below.
- **`children`** — used when `data` is not provided.
- **`...rest`** — any extra `data-*` attribute is forwarded to the rendered element and picked up by the IR walker. This is how you express layout, spacing, borders, bullets, and numbering:

```jsx
<Paragraph data-spacing-before="200" data-spacing-after="100">
    Paragraph with 200/100 twip spacing around it.
</Paragraph>

<Paragraph data-bullet-level="0">Bullet list item at level 0.</Paragraph>

<Paragraph
    data-numbering-reference="decimal"
    data-numbering-level="0"
>
    Numbered list item.
</Paragraph>
```

### `<Paragraphs>`

Renders an array of paragraph strings. A convenience wrapper when you have pre-parsed content:

```jsx
<Paragraphs data={['First paragraph.', 'Second <strong>paragraph</strong>.']} />

// Forward extra props to every child via dataProps:
<Paragraphs
    data={content.paragraphs}
    dataProps={{ 'data-spacing-after': '100' }}
/>
```

## `<TextRun>`

Inline styled text span. Maps to a docx `TextRun`.

```jsx
<Paragraph>
    Awarded in <TextRun bold>2004</TextRun>,
    <TextRun italics>summa cum laude</TextRun>, with distinction.
</Paragraph>
```

Props:

- **`bold`** — boolean. Sets `data-bold="true"`.
- **`italics`** — boolean. Sets `data-italics="true"`.
- **`underline`** — boolean. Sets `data-underline="true"`.
- **`style`** — string style id, e.g. `"Hyperlink"` for clickable link styling.
- **`children`** — text content.
- **`...rest`** — forwarded as `data-*` attributes. Used for positional tabs:

```jsx
<TextRun data-positionaltab-alignment="right" data-positionaltab-leader="dot">
    page 3
</TextRun>
```

## `<H1>`, `<H2>`, `<H3>`, `<H4>`

Heading components. Each renders the corresponding `<h1>`–`<h4>` with `data-heading="HEADING_N"`.

```jsx
<H1>Annual Report</H1>
<H2>Executive summary</H2>
<H3>Methodology</H3>

// data prop for inline marks, same as <Paragraph>:
<H1 data="Fiscal <strong>2025</strong> results" />

// Extra data-* props pass through:
<H1 data-spacing-after="200">Title with explicit spacing</H1>
```

There are deliberately no `<H5>` / `<H6>`. Add them if you need them — see [the package's CLAUDE.md](../../CLAUDE.md) for the "adding a builder component" runbook.

## `<Image>` and `<Images>`

Renders an image reference that the docx adapter fetches asynchronously during compile.

```jsx
<Image data={{ url: '/cover.png', alt: 'Cover image' }} width={400} height={300} />

// Bare URL string also works:
<Image data="/cover.png" />

// Array convenience wrapper:
<Images
    data={[
        { url: '/fig1.png', alt: 'Figure 1' },
        { url: '/fig2.png', alt: 'Figure 2' },
    ]}
/>
```

Props:

- **`data`** — either a `{ value | url, alt? }` object or a plain URL string. Returns `null` when `data` is missing or the URL is empty.
- **`width`** — image width in docx units (default `400`).
- **`height`** — image height in docx units (default `300`).

The browser preview renders a regular `<img src=…>`. The docx adapter reads `data-src`, `data-transformation-width`, `data-transformation-height`, and `data-alttext-description` from the rendered HTML, fetches the image bytes asynchronously via `fetch(url).arrayBuffer()`, and embeds them in the document.

## `<Link>` and `<Links>`

Hyperlink component with automatic external/internal detection.

```jsx
// External: href starts with "http"
<Link data={{ label: 'Research Office', href: 'https://example.edu' }} />

// Internal: href is an in-document anchor
<Link data={{ label: 'See Section 3', href: '#section-3' }} />

// Bare string shortcut — label and href are the same
<Link data="https://example.edu" />

// Array wrapper
<Links
    data={[
        { label: 'Home', href: 'https://example.edu' },
        { label: 'Contact', href: 'https://example.edu/contact' },
    ]}
/>
```

The component renders an `<a>` with `data-type="externalHyperlink"` or `data-type="internalHyperlink"` plus a nested `<span data-type="text" data-style="Hyperlink">` for the label. The docx adapter emits an `ExternalHyperlink` or `InternalHyperlink` with a styled `TextRun` child.

## `<List>` and `<Lists>`

Nested bullet lists. Each list item can carry paragraphs, images, links, and child lists.

```jsx
<List
    data={[
        { paragraphs: ['First item'] },
        {
            paragraphs: ['Second item, with a sublist below'],
            lists: [
                [
                    { paragraphs: ['Nested item A'] },
                    { paragraphs: ['Nested item B'] },
                ],
            ],
        },
    ]}
/>

// Array wrapper
<Lists data={[list1, list2]} />
```

Each item shape:

```ts
{
    paragraphs?: string[]
    links?: Array<{ label, href }>
    imgs?: Array<{ url, alt }>     // or `images`, both accepted
    lists?: Array<ListItem[]>      // nested sub-lists
}
```

Indentation is visual-only in the preview. The docx adapter applies `data-bullet-level` to each paragraph so the generated docx has proper bullet nesting.

## Tables via `<Paragraph as="div">`

Tables are not their own component. They're expressed through nested `<Paragraph as="div">` elements with `data-type` attributes — a deliberate choice that keeps the builder component surface small while still supporting the full table model the docx library offers.

```jsx
<Paragraph as="div" data-type="table">
    <Paragraph as="div" data-type="tableRow">
        <Paragraph
            as="div"
            data-type="tableCell"
            data-width-size="40"
            data-width-type="pct"
            data-borders-bottom-style="single"
            data-borders-bottom-size="4"
            data-borders-bottom-color="000000"
        >
            <Paragraph>
                <TextRun bold>Source</TextRun>
            </Paragraph>
        </Paragraph>
        <Paragraph
            as="div"
            data-type="tableCell"
            data-width-size="60"
            data-width-type="pct"
        >
            <Paragraph>
                <TextRun bold>Amount</TextRun>
            </Paragraph>
        </Paragraph>
    </Paragraph>
    {/* ... more rows ... */}
</Paragraph>
```

Supported data attributes inside a cell include `data-width-size` / `data-width-type` (DXA, percentage, auto, nil), `data-margins-top`/`data-margins-bottom`/`data-margins-left`/`data-margins-right`, and per-side borders via `data-borders-{side}-{style|size|color}`. See `src/ir/attributes.js` in the source tree for the exhaustive `attributeMap`.

## Special text nodes

Two strings carry special meaning in text content: `_currentPage` and `_totalPages`. The docx adapter replaces them with docx page-number fields. Use them inside a `TextRun`:

```jsx
<Paragraph>
    Page <TextRun>_currentPage</TextRun> of <TextRun>_totalPages</TextRun>
</Paragraph>
```

Typically used inside header or footer registrations:

```jsx
useDocumentOutput(block, 'docx', (
    <Paragraph>
        Page <TextRun>_currentPage</TextRun>
    </Paragraph>
), { role: 'footer' })
```

## See also

- **[/sections reference](./sections.md)** — `Section` and `StandardSection` remove the register-and-render boilerplate around these builders.
- **[/ir reference](./ir.md)** — the `attributeMap` that defines which `data-*` attributes the IR walker recognizes.
- **[Multi-block reports guide](../guides/multi-block-reports.md)** — how multiple sections compose into one document.
- **[Concepts](../concepts.md)** — why builders use `data-*` attributes instead of a typed React prop surface.

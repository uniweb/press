# The docusite pattern

A docusite is a Uniweb site whose URL *is* the document. The page you browse is the same content the download button compiles into a `.docx` file. There is no separate template, no export pipeline, no drift between what you see and what you get. The site is navigable, themed, and live; the file is a side effect of the same tree.

This guide walks through the architecture using the `cv-loom` template as a reference implementation.

## Data flow

```
YAML collection (profile data)
  |
  v
site.yml declares collection ──> page.yml declares data: profile
  |
  v
section markdown with {Loom expressions}
  |
  v
content handler (foundation.js) resolves Loom vars against data
  |
  v
framework re-parses ──> components receive plain { content, block }
  |                                    |
  v                                    v
React render (web preview)      useDocumentOutput registration
                                       |
                                       v
                              compile('docx') ──> .docx Blob
                                       |
                                       v
                              triggerDownload ──> browser save
```

Every section component sees fully resolved content -- no placeholders, no raw data. Press doesn't know or care whether the content was static markdown or dynamically instantiated via Loom. It just compiles the registered tree.

## The single-tree pattern

The architectural idea that makes a docusite work: each section component builds **one JSX tree** using Press builder components, then uses that tree for both purposes.

```jsx
import { useDocumentOutput } from '@uniweb/press'
import { H2, H3, Paragraph } from '@uniweb/press/docx'
import { SP } from '#utils/docx-spacing.js'

export default function CvEntry({ content, block }) {
  const { title, paragraphs, items } = content

  const body = (
    <>
      {title && (
        <H2
          data={title}
          className="text-heading text-2xl font-bold mb-4"
          data-pagebreakbefore="true"
          data-spacing-before={SP.sectionBefore}
          data-spacing-after={SP.sectionAfter}
        />
      )}
      {paragraphs.map((p, i) => (
        <Paragraph
          key={`p${i}`}
          data={p}
          className="cv-paragraph"
          data-spacing-after={SP.paraAfter}
        />
      ))}
      {items.map((item, i) => (
        <Fragment key={i}>
          {item.title && (
            <H3
              data={item.title}
              className="cv-item-title"
              data-spacing-before={SP.itemBefore}
              data-spacing-after={SP.itemAfter}
            />
          )}
          {item.paragraphs.map((p, j) => (
            <Paragraph
              key={`${i}-${j}`}
              data={p}
              className="cv-item-detail"
              data-spacing-after={SP.detailAfter}
            />
          ))}
        </Fragment>
      ))}
    </>
  )

  useDocumentOutput(block, 'docx', body)

  return <div className="cv-entry">{body}</div>
}
```

Two things control two outputs from the same tree:

- **`data-*` attributes** (`data-spacing-before`, `data-pagebreakbefore`, `data-alignment`) control docx formatting. The IR walker reads them during compilation. The browser ignores them.
- **`className`** controls the web preview. CSS handles spacing, typography, and layout on screen. The docx adapter ignores class names.

The `body` variable is used twice -- registered via `useDocumentOutput` and returned as the React render. There is no second tree to drift from the first.

## Setting up the layout

The layout wraps the page body in a `DocumentProvider` and provides a download button. Every section rendered inside the provider that calls `useDocumentOutput` contributes to the compiled document.

```jsx
import { DocumentProvider, useDocumentOutput } from '@uniweb/press'
import { Paragraph, TextRun } from '@uniweb/press/docx'
import DownloadBar from '#components/DownloadBar.jsx'

export default function CvLayout({ body, header, page }) {
  const filename =
    (page?.title || 'document').toLowerCase().replace(/\s+/g, '-') + '.docx'

  return (
    <DocumentProvider>
      {header}
      <DocxFooter />
      <div className="max-w-3xl mx-auto px-6 py-12">{body}</div>
      <DownloadBar filename={filename} />
    </DocumentProvider>
  )
}
```

The layout needs three things:

1. **`DocumentProvider`** around the body so section registrations are collected.
2. **A download component** that calls `compile` and `triggerDownload`.
3. **Optional structural registrations** -- the docx footer (page numbers) and header (branding) are registered from inside the layout tree but render nothing visible.

### The download component

```jsx
import { useDocumentCompile, triggerDownload } from '@uniweb/press'

export default function DownloadBar({ filename = 'document.docx' }) {
  const { compile, isCompiling } = useDocumentCompile()

  const handleDownload = async () => {
    const blob = await compile('docx', { title: 'Curriculum Vitae' })
    triggerDownload(blob, filename)
  }

  return (
    <button onClick={handleDownload} disabled={isCompiling}>
      {isCompiling ? 'Generating...' : 'Download .docx'}
    </button>
  )
}
```

The `compile` options object accepts `title`, `creator`, `paragraphStyles`, and `numbering` -- see the [style pack guide](./style-pack.md) for reusable style definitions.

### The docx footer (page numbers)

A layout-internal component that registers a footer without rendering anything visible. The `useRef({}).current` pattern creates a stable object key for Press's WeakMap registration (since this isn't a section component with a `block`).

```jsx
function DocxFooter() {
  const footerKey = useRef({}).current

  const footer = (
    <Paragraph>
      <TextRun
        data-positionaltab-alignment="center"
        data-positionaltab-relativeto="margin"
        data-positionaltab-leader="none"
      >{'\t'}</TextRun>
      <TextRun>_currentPage</TextRun>
      <TextRun> of </TextRun>
      <TextRun>_totalPages</TextRun>
    </Paragraph>
  )

  useDocumentOutput(footerKey, 'docx', footer, { role: 'footer' })

  return null
}
```

## Docx spacing

Centralize spacing constants in a utility file. Values are in twips (1 pt = 20 twips). Section components import and apply them as `data-spacing-before` / `data-spacing-after` attributes.

```js
// src/utils/docx-spacing.js
export const SP = {
  sectionBefore: 480, // 24pt
  sectionAfter: 120,  // 6pt
  paraAfter: 120,     // 6pt
  itemBefore: 200,    // 10pt
  itemAfter: 40,      // 2pt
  detailAfter: 60,    // 3pt
}
```

These attributes affect only the compiled docx. CSS handles web preview spacing independently -- use `className`, `margin`, or Tailwind utilities. The two spacing systems are decoupled by design: screen typography and Word typography have different optimal values.

## Branding from content

The `PageBranding` pattern: a layout section that registers the docx header from author-editable markdown. The author controls branding by editing `site/layout/header.md` -- no code changes needed to rebrand.

```markdown
<!-- site/layout/header.md -->
---
type: PageBranding
---

# Acme University

## Curriculum Vitae
```

The component registers a docx header and renders nothing on the web page:

```jsx
export default function PageBranding({ content, block }) {
  const { title, subtitle } = content

  const header = (
    <Paragraph>
      {title && <TextRun bold>{title}</TextRun>}
      <TextRun
        data-positionaltab-alignment="right"
        data-positionaltab-relativeto="margin"
        data-positionaltab-leader="none"
      >{'\t'}</TextRun>
      {subtitle && <TextRun italics>{subtitle}</TextRun>}
    </Paragraph>
  )

  useDocumentOutput(block, 'docx', header, { role: 'header' })

  return null
}
```

The institution name appears bold on the left margin; the document label appears italic on the right. To rebrand, the content author edits the markdown heading and subtitle -- the component is generic.

## Reference

- **`cv-loom` template** (`templates/cv-loom/`) -- a complete working docusite with Loom-instantiated content, centralized spacing, branding from layout content, and a download bar.
- **[Core API](../api/core.md)** -- `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`.
- **[Docx builders](../api/docx.md)** -- every builder component with examples.
- **[Style pack](./style-pack.md)** -- reusable `paragraphStyles` and `numbering` definitions for the `compile` options.
- **[Multi-block reports](./multi-block-reports.md)** -- how the provider aggregates output across many sections.
- **[Press README](../../README.md)** -- overview, hello world, subpath exports.

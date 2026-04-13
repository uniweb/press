# @uniweb/press

Frontend document generation for Uniweb foundations. Lets foundations produce downloadable Word, Excel, and PDF reports from live CMS data — entirely in the browser at runtime, with no backend file storage required.

## Status

**Pre-release.** Phase 1 in progress — docx output via the registration-hook + IR-walker pattern inherited from the legacy `@uniwebcms/report-sdk`. xlsx and PDF support planned for phases 2 and 3.

## Overview

A foundation that wants to generate reports imports from this package and:

1. Wraps its document-producing area in `<DocumentProvider>`.
2. Calls `useDocumentOutput(format, fragment, options)` from inside section components to register format-specific output.
3. Renders a `<DownloadButton format="docx">` (or its own UI calling `compile()` directly).

When the user clicks Download, the format adapter lazy-loads, walks all registered fragments for the page, and produces a Blob that the browser downloads.

## Three patterns coexist by design

Different document formats need different shapes; this package does not try to force a single IR.

- **docx:** JSX with semantic `data-type='table'`, `data-margins-*`, `data-borders-*` attributes. The same JSX is the React preview AND the source for `htmlToDocx()`. Zero divergence between preview and document.
- **xlsx:** Plain `{ title, headers, data }` objects (phase 2). The preview is independent — often charts.
- **pdf:** Either reuses docx JSX via Paged.js, or uses `@react-pdf/renderer` for fine control (phase 3).

What unifies them is the registration interface (`useDocumentOutput`), not the data shape.

## Quick example

```jsx
import {
  DocumentProvider,
  DownloadButton,
  useDocumentOutput,
  Section,
  Paragraph,
  H1
} from '@uniweb/press/react'

function ResearchSummary({ block }) {
  const markup = (
    <>
      <H1>{block.content.title}</H1>
      <Paragraph>{block.content.summary}</Paragraph>
    </>
  )

  // Register the same JSX as the docx output for this block
  useDocumentOutput('docx', markup)

  return <Section>{markup}</Section>
}

function ReportPage({ children }) {
  return (
    <DocumentProvider>
      {children}
      <DownloadButton format="docx" />
    </DocumentProvider>
  )
}
```

## No build step

This package ships raw source files. The `exports` field in `package.json` points directly at `src/`. Consumers (foundations) bundle via Vite, which handles the dynamic imports for format adapters and tree-shakes unused builder components.

## Testing

```bash
pnpm test         # run all tests
pnpm test:watch   # watch mode
```

## Architecture & design decisions

The full design plan, the legacy reverse-engineering that informed it, and the open questions live at `kb/plans/press-package.md` in the workspace. Read that before making non-trivial changes.

## License

Apache-2.0

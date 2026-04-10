# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

`@uniweb/documents` is a frontend document generation library for Uniweb foundations. It lets foundations produce downloadable Word, Excel, and PDF reports from live CMS data — entirely in the browser at runtime, with no backend file storage.

## Status

**Pre-release, phase 1 in progress.** docx output is the priority. xlsx and PDF are deferred to later phases.

The full design plan, decisions, and open questions live at `kb/plans/documents-package.md` in the workspace. **Read it before making non-trivial changes** — it captures the legacy reverse-engineering that shaped the architecture.

## Important: No Build Step

Like `@uniweb/kit`, this package ships **raw source files** — no bundler, no `dist/`. The `exports` field in `package.json` points directly at `./src/...`. Consumers (foundations) bundle via Vite themselves.

This means edits to `src/` are immediately effective in any linked workspace package. No build step before tests. No build step before publishing.

## File Structure

- `src/index.js` — Main barrel
- `src/react/` — React layer
  - `react/DocumentProvider.jsx` — Context with `WeakMap<Block, OutputBundle>` storage
  - `react/useDocumentOutput.js` — Registration hook (concurrent-safe)
  - `react/DownloadButton.jsx` — Convenience UI
  - `react/components/` — Builder components (`Paragraph`, `TextRun`, `H1`-`H4`, `Section`)
- `src/ir/` — Intermediate representation
  - `ir/attributes.js` — Declarative `data-*` attribute mapping
  - `ir/parser.js` — `parse5`-based HTML → IR walker
- `src/docx/` — docx format adapter (lazy via subpath import)
- `src/orchestrator/` — Walker that traverses page blocks and collects outputs
- `tests/` — Vitest tests, organized by source dir

## Architecture

Three patterns coexist by design:

1. **docx:** JSX with semantic `data-type='table'`, `data-margins-*` attributes. The same JSX is the React preview AND the source for `htmlToDocx()`. Zero divergence.
2. **xlsx (phase 2):** Plain `{ title, headers, data }` objects. Preview (often charts) is independent.
3. **pdf (phase 3):** Reuses docx JSX via Paged.js, or uses `@react-pdf/renderer` for fine control.

What unifies them is the **registration interface** (`useDocumentOutput`), not the data shape.

## Important conventions

### Data attribute vocabulary

The `data-*` attribute vocabulary on builder components is inherited verbatim from the legacy `@uniwebcms/report-sdk` (`/Users/dmac/Proximify/report-sdk/src/utils.js:223-410`). ~30 attributes covering layout, borders, headings, numbering, positional tabs, image transforms, hyperlinks, and floating positioning. **Don't redesign this without good reason** — foundation porting from legacy depends on it.

### Block.output is gone

The legacy mutated `block.output[format]` from inside React render. We do not. Modern Block class (`packages/core/src/block.js`) has removed this property. Outputs live in a `WeakMap<Block, OutputBundle>` inside `<DocumentProvider>` context. Registration via the `useDocumentOutput` hook is concurrent-React-safe and Strict-Mode-safe.

### No types

This package uses **plain JavaScript with JSDoc comments for documentation only** — no `@type` annotations, no type checker. Match the rest of the Uniweb workspace. If types ever feel necessary, add them locally to specific files; don't introduce a project-wide TypeScript config.

### parse5, not browser DOMParser

The IR parser uses `parse5` instead of the browser `DOMParser` so it runs in Node and is unit-testable without jsdom. Faster and more standard than the legacy approach.

## Dependencies

- `parse5` — HTML parser (testable in Node)
- `docx` — Word document generation (lazy-loaded via subpath import)
- React 18/19 as peer dependency

## Testing

```bash
pnpm test         # vitest run
pnpm test:watch   # vitest watch
```

Tests live in `tests/` mirroring the `src/` structure. React component tests use `@testing-library/react` with the `jsdom` Vitest environment.

## Publishing

Versioning is manual via the workspace's `scripts/publish.js`. The package is registered there.

```bash
node scripts/publish.js          # dry run from workspace root
node scripts/publish.js --patch  # bump patch and publish
```

## References

- `kb/plans/documents-package.md` — full design plan and decisions
- Legacy reference paths in the kb plan's References section
- `packages/kit/CLAUDE.md` — convention reference (this package mirrors kit's no-build-step pattern)

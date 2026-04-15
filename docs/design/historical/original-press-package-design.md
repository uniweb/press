# Document Generation System — Design Document

**Status:** Phase 1 complete (core plumbing). Phase 1.5 planned (template engine + component enrichment).
**Last updated:** 2026-04-10
**Supersedes:** Previous version of this document (same path), which was based on incomplete understanding of the legacy system.

## Correction Notice

The Phase 1 design was based on reverse-engineering the legacy system across conversations where the original architect didn't recall all details. A colleague (Xiang) who was directly involved subsequently provided the complete legacy codebase at `.assets/report-system/`. This revealed:

1. **The template engine (unilang) IS used in production.** The previous conclusion that "ZERO unilang usage was found in production foundations" was wrong. The template engine operates upstream of the components — `Article.js` instantiates `{placeholders}` in ProseMirror content before semantic parsing. By the time content reaches a component, it's already instantiated. Components never see raw `{placeholders}`. That's why grepping component code for unilang usage found nothing.

2. **`Article.js` is the missing bridge.** It connects content (with placeholders), profile data, and the template engine, producing instantiated content that the semantic parser then processes. Its `instantiateContent()` walks ProseMirror nodes and calls `engine.render(text, vars)` on each text node.

3. **The default Section component is a substantial piece.** It handles generic content rendering (title, subtitle, paragraphs, images, links, lists) using `parseBlockContent()` and builder components. The `DynamicSection` adds formatting modes (two-column layouts, ordered lists, indentation, group items). Our Phase 1 components are too thin.

4. **The DocxGenerator is more capable than our adapter.** Async image fetching, page numbering (`_currentPage`/`_totalPages`), default "Page X of Y" headers/footers, `firstPageOnly` semantics, Bookmark support.

The Phase 1 **registration architecture** (WeakMap + context + hook), **IR layer** (declarative attribute map + parse5 walker), and **orchestrator** (compile outputs + role classification) are all sound and don't need rework. The gaps are in the component layer, the docx adapter, and the missing template engine.

## Architecture Overview

The system spans **two packages** plus the existing Uniweb stack:

```
┌─────────────────────────────────────────────────────────────┐
│  Foundation (report components)                             │
│                                                             │
│  Uses @uniweb/press/react  — builder components, hooks  │
│  Uses @uniweb/press/sdk    — instantiation helpers       │
│  Uses @uniweb/press/docx   — lazy-loaded adapter         │
│  Uses @uniweb/loom  — (via sdk, or directly)      │
│  Uses @uniweb/kit              — standard kit hooks           │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐    ┌───────────────────────────────┐
│ @uniweb/loom         │    │ @uniweb/press             │
│                      │    │                               │
│ Pure JS, no React,   │    │ /react  — React components     │
│ no Uniweb deps.      │    │ /sdk    — helpers + instantiate│
│                      │    │ /docx   — docx adapter         │
│ render()             │    │ /xlsx   — xlsx adapter (ph 2)  │
│ evaluateText()       │    │ .       — IR utilities          │
│ snippets, functions  │◄───│                               │
│                      │    │ Depends on loom                │
└──────────────────────┘    │ for the sdk entry point        │
                            └───────────────────────────────┘
```

### Data Flow for Reports

```
Profile data (CV)
       │
       ▼
Content with {placeholders}          Template Engine
(ProseMirror doc from CMS)    ───►   render(text, vars)
       │                              evaluateText(expr, vars)
       │                                    │
       ▼                                    ▼
Instantiated content              Selected/filtered items
(no more {…})                     (from profile sections)
       │                                    │
       ▼                                    ▼
Semantic Parser (Block class)     Passed to component as data
→ { title, paragraphs, items }
       │
       ▼
Foundation component
  ├── Renders preview (React)
  └── Registers docx output (useDocumentOutput)
       │
       ▼ (on Download click)
Orchestrator: JSX → renderToStaticMarkup → htmlToIR
       │
       ▼
Docx adapter → Document → Blob → browser download
```

### Data Flow for Regular Sites as Documents

A regular Uniweb site (no placeholders, no profile data) is also a valid document source. The content is already instantiated (it's static markdown). The foundation just needs document generation components:

```
Static markdown content
       │
       ▼
Semantic Parser (Block class)
→ { title, paragraphs, items }
       │
       ▼
Foundation component (with document support)
  ├── Renders preview (React)
  └── Registers docx output (useDocumentOutput)
       │
       ▼
Same pipeline as above
```

No template engine needed for this case. The documents package works standalone.

## @uniweb/loom

### Purpose

A pure JavaScript template engine for instantiating text with data. Takes strings containing `{placeholder}` expressions, evaluates them against a variable resolver, and returns resolved text. Also evaluates standalone expressions for data selection, filtering, and transformation.

Originally called "unilang" internally. Supports:
- Variable substitution: `{family_name}` → `"Macrini"`
- Labelled variables: `{@family_name}` → `"Family Name"` (localized label)
- Functions in Polish notation: `{", " city province country}` → `"Fredericton, NB, Canada"`
- Conditionals: `{+? 'Faculty/Department of ' faculty_department}` → `"Faculty/Department of Engineering"` (only if value exists)
- Date formatting: `{# -date=y degree_received_date}` → `"2004"`
- Filtering: `{? (= phone_type 'Home') /personal_information/telephone}`
- Sorting: `{>> -desc publication_date publications}`
- Aggregation: `{++ funding_amount grants}`
- User-defined snippets: `[myFormat title date] { {title} ({# -date=y date}) }`
- Optional Plain layer: English-like syntax that transpiles to the expression language (designed, not yet implemented; see [`plain.md`](./plain.md))

### API Surface

```js
import { Loom } from '@uniweb/loom'

const engine = new Loom(snippets, customFunctions)

// Text instantiation — find {…} placeholders and evaluate each
engine.render("Name: {family_name}, {first_name}", key => profile.getValue(key))
// → "Name: Macrini, Diego"

// Expression evaluation — evaluate a single expression, return any type
engine.evaluateText("personal_information/education", key => profile.getValue(key))
// → [{degree_name: "PhD", ...}, ...]

// Used for filtering
engine.evaluateText(filterExpr, key => item[key])
// → true/false
```

### Built-in Function Categories

| Category | Operators | Purpose |
|----------|-----------|---------|
| Accessor | `.` | Property access, dot notation traversal |
| Creator | `^`, `~`, `\`, `@`, `<>`, `phone`, `address`, `org`, `ref`, `currency`, `email` | Construct specialized types (ranges, matrices, i18n values) |
| Collector | `++`, `++!!` | Sum, concatenate, count non-empty |
| Filter | `&`, `\|`, `\|=`, `\|?`, `&?`, `+?` | Boolean logic, membership, conditional join |
| Formatter | `#`, `!`, `!!` | Universal formatting (dates, numbers, lists, JSON), negation |
| Mapper | `+`, `-`, `*`, `/`, `%`, `>`, `<`, `>=`, `<=`, `=`, `==`, `!=` | Arithmetic, comparison, equality |
| Joiner | `+-`, `+:` | Combine values with separators |
| Sorter | `>>` | Sort by type (numbers, dates, text) |
| Switcher | `?`, `??`, `???`, `?:` | Ternary/case branching |

### Source Material

- **Implementation:** `.assets/report-system/app-engine/TemplateCore/` (template_engine.js, tokenizer.js, template_functions.js, plain_script.js)
- **Tests:** `/Users/dmac/Proximify/unirepo/js/tools/unitTests/tests/` — 17+ test categories in markdown files with YAML frontmatter (variables, expected output, snippets)
- **Docs:** `.assets/report-system/docs/` (unilang.md, unilang_basics.md, unilang_quick_guide.md, plain_script_*.md, placeholder7.md)

### Package Design

```
packages/loom/
├── src/
│   ├── index.js              # Loom class
│   ├── tokenizer.js          # findEnclosures, parseSnippets, parseCommands
│   ├── functions.js           # Built-in function library
│   └── plain/                 # Optional Plain transpiler (subpath: @uniweb/loom/plain)
├── tests/
│   ├── engine.test.js         # Core render/evaluateText tests
│   ├── functions.test.js      # Built-in function tests
│   ├── tokenizer.test.js      # Tokenizer tests
│   └── fixtures/              # Ported markdown test cases
├── package.json
└── README.md
```

No build step (raw source, like kit and documents). Pure JS + JSDoc. Vitest.

## @uniweb/press — Enrichment Plan

### Entry Points

| Entry point | Purpose | Audience |
|-------------|---------|----------|
| `@uniweb/press` | IR utilities (htmlToIR, attributeMap) | Advanced / testing |
| `@uniweb/press/react` | React components, provider, hooks | Foundation authors |
| `@uniweb/press/sdk` | Content helpers, template integration, formatters | Foundation authors |
| `@uniweb/press/docx` | Docx adapter (lazy-loaded, ~400KB) | Download handler |
| `@uniweb/press/xlsx` | Xlsx adapter (lazy-loaded, phase 2) | Download handler |

### `/sdk` Entry Point (NEW)

Provides utilities for foundation authors to work with content in document contexts:

```js
import {
    instantiateContent,     // Walk ProseMirror content, replace {placeholders}
    parseStyledString,      // Parse HTML inline marks to TextRun-compatible objects
    makeCurrency,           // Format number as currency
    makeRange,              // "start - end" or single value
    makeParentheses,        // Wrap in ()
    join,                   // Array join with separator
    convertMillimetersToTwip, // Unit conversion
} from '@uniweb/press/sdk'
```

**`instantiateContent(content, engine, vars)`** — The key function. Walks a ProseMirror-style content tree (the same shape as what `block.content` provides in raw form, or what `site-content.json` stores) and calls `engine.render(text, vars)` on each text node. Returns the instantiated content tree, which can then be fed to the semantic parser or used directly.

**`parseStyledString(htmlString)`** — Parses an HTML string with inline marks (`<strong>`, `<em>`, `<u>`) into an array of `{ content, bold, italics, underline }` objects. This is what the legacy `Paragraph` `data` prop uses internally. Ported from legacy `report-sdk/src/utils.js:116-186`.

### Component Layer — Gap Analysis

**What exists (Phase 1, sound):**

| Component | Status | Notes |
|-----------|--------|-------|
| `Paragraph` | Minimal | Missing `data` prop (styled string), `format` modes |
| `TextRun` | Complete | Bold, italic, underline, style |
| `H1`-`H4` | Minimal | Missing `data` prop (styled string) |
| `Section` | Complete | Layout wrapper |

**What's missing:**

| Component | Legacy has | Needed for |
|-----------|-----------|------------|
| `Paragraph` with `data` prop | `parseStyledString(data)` → TextRun children | Every paragraph of real content |
| `Paragraph` with `format` modes | 5 modes: twoColumnLayout/Wide/Justified, twoLevelIndentation, ordered-list-reversed | Complex CV layouts |
| `Paragraphs` (plural) | Renders array of paragraph strings | Standard Section pattern |
| `H1`-`H4` with `data` prop | Parse styled strings in headings | Headings with inline formatting |
| `Image` / `Images` | `data-type="image"` with src, dimensions, alt | Images in documents |
| `Link` / `Links` | External/internal hyperlink detection | Links in documents |
| `List` / `Lists` | Nested bullet lists with `data-bullet-level` | Lists in documents |

### Docx Adapter — Gap Analysis

**What exists (Phase 1, sound):**

| Feature | Status |
|---------|--------|
| Paragraph (heading, spacing, bullet, numbering) | Complete |
| TextRun (bold, italic, underline, positionalTab) | Complete |
| Table / TableRow / TableCell (width, margins, borders) | Complete |
| ExternalHyperlink / InternalHyperlink | Complete |
| Header / Footer (basic) | Complete |
| `compileDocx()` → Blob | Complete |

**What's missing:**

| Feature | Legacy has | Priority |
|---------|-----------|----------|
| Image support (`ImageRun` with async fetch) | `fetchImageData(url)` → ArrayBuffer → `ImageRun` | High |
| Page numbering (`_currentPage`, `_totalPages`) | `PageNumber.CURRENT`, `PageNumber.TOTAL_PAGES` | High |
| Default header/footer with "Page X of Y" | `createDefaultHeaderFooter()` | High |
| `firstPageOnly` header/footer | `titlePage` property, separate first/default | Medium |
| Bookmark support | `Bookmark` element | Low |
| Async element creation (`Promise.all` throughout) | All `createDocElement` calls are async | High (for images) |
| Section spacing option | `addSectionSpacing` config | Low |
| Document metadata passthrough | `configs` spread into `Document` constructor | Low |

### Registration Layer (Phase 1 — Sound, No Changes)

- `DocumentProvider` — `WeakMap<Block, Map<format, {fragment, options}>>` store
- `useDocumentOutput(block, format, fragment, options)` — registration hook
- `DocumentContext` — shared React context
- Block order tracking for iteration

### IR Layer (Phase 1 — Sound, No Changes)

- `attributeMap` — 40-entry declarative map (replaces legacy switch statement)
- `attributesToProperties()` — applies map to parse5 attributes
- `htmlToIR()` — parse5-based HTML → IR walker
- Default fallthrough for unknown `data-*` attributes

### Orchestrator (Phase 1 — Sound, Minor Enhancement)

- `compileOutputs(store, format)` — JSX → HTML → IR for docx; passthrough for xlsx
- Role classification (header/footer/body)
- **Enhancement needed:** Wire `applyTo` option for firstPageOnly headers/footers

## Integration Pattern: Foundation Handlers

Foundations declare lifecycle `handlers` in `foundation.js`. The runtime calls them at the right pipeline stages. Components receive already-processed content — they never see raw `{placeholders}`. This mirrors the legacy pattern where `Article.js` instantiated content before components saw it, but uses the existing foundation→runtime contract instead of a separate class.

### The Mechanism

The foundation already talks to the runtime via `foundation.js`. The default export flows through the generated entry into `uniweb.foundationConfig`. Any property on the default export — including functions — is available to the runtime. We add a `handlers` object:

```js
// foundation.js
import { Loom } from '@uniweb/loom'
import { instantiateContent } from '@uniweb/press/sdk'

const engine = new Loom()

export default {
    defaultLayout: 'ReportLayout',

    handlers: {
        /**
         * Called by runtime before content reaches the component.
         * Walks ProseMirror content tree, replaces {placeholders} with
         * resolved values from the data source.
         */
        content(content, { block, data }) {
            if (!data) return content
            return instantiateContent(content, engine, key => data[key])
        },

        /**
         * Called by runtime after data is fetched, before it reaches
         * the component. Filter, sort, transform entities.
         */
        data(data, { block, params }) {
            // e.g., filter by date range from report params
            return data
        },
    },
}
```

### Runtime Integration Points

The runtime already has clear pipeline stages. Adding handler calls is minimal:

```
foundation.js default export
    → generate-entry.js spreads into capabilities
    → registerFoundation() stores in uniweb.foundationConfig
    → foundationConfig.handlers available to runtime
```

**Content handler** — called in the Block/Page construction path, between loading raw content from `site-content.json` and running the semantic parser. If `foundationConfig.handlers?.content` exists, the runtime calls it with the raw ProseMirror content and the block's data context. The returned content is what gets parsed.

**Data handler** — called after entity data is fetched (by the runtime's existing data pipeline), before the data is attached to the block. If `foundationConfig.handlers?.data` exists, the runtime calls it with the fetched data and context.

The runtime changes are small — a few lines at the existing pipeline junctions. The runtime doesn't know about template engines or unilang. It just calls `handlers.content(content, context)` and gets back content.

### What Components See

With handlers in place, components are identical for report and non-report foundations:

```jsx
// This component works the same whether content had {placeholders} or not.
// If the foundation declared a content handler, placeholders are already
// resolved by the time block.content reaches here.

export default function DefaultSection({ block }) {
    const { content } = block
    // content is already instantiated + parsed:
    // { title, subtitle, paragraphs, images, links, lists, items }

    const markup = (
        <>
            <H1 data={content.title} />
            <H2 data={content.subtitle} />
            <Paragraphs data={content.paragraphs} />
            <Images data={content.images} />
            <Links data={content.links} />
            <Lists data={content.lists} />
        </>
    )

    useDocumentOutput(block, 'docx', markup)
    return <Section>{markup}</Section>
}
```

No `useLoom()`, no `instantiateContent()` calls in components. The foundation declared its content handling once in `foundation.js`, and every component benefits.

### Why This Is Better Than Per-Component Instantiation

1. **Components stay clean** — identical for report and non-report foundations.
2. **No new mechanism** — uses the existing foundation→runtime contract (`foundation.js` default export → `foundationConfig`).
3. **Foundation controls behavior** — a docs foundation has no handlers. A report foundation declares them. The runtime is generic.
4. **Template engine stays decoupled** — it's a dependency of the foundation, not the runtime. The runtime calls `handlers.content()` without knowing what's inside.
5. **Extensible** — future handlers (e.g., `citation`, `i18n`, `validation`) follow the same pattern without runtime changes.

### Serialization Safety

The `capabilities` object (which includes `handlers`) flows through `registerFoundation()` as a live JS object with functions. The runtime schema build (`schema.json` for the editor) only picks specific serializable fields (`vars`, `defaultLayout`, etc.) — functions are naturally excluded. No conflict.

## Citation Handling

**Citations are a foundation concern, not a template-engine or documents-package concern.** Neither `@uniweb/loom` nor `@uniweb/press` ships citation formatting. Foundations that need bibliographies import [`citestyle`](/Users/dmac/Uniweb/csl/packages/citestyle/) directly and use it at the component level.

### Why not in the template engine?

Citation formatting needs *structural* output — `{ text, html, parts, links }` — not just string substitution. Template placeholders work for scalars (names, dates, titles) but can't express "format this publication list with APA rules that depend on author count, date presence, container type, etc." The legacy `<u-cite>` smuggling approach (stub JSON inside a custom tag waiting for a downstream interpreter) worked empirically but was obscure and never had an interpreter in the modern stack. We removed it entirely in phase 1.5.

Citations also *look different* in preview (HTML with clickable DOIs) vs. docx (plain text with positional tabs). That's a match for the JSX-and-register pattern where a component builds both representations at once — not for a single-string template output.

### The recommended pattern

A foundation that needs citations:

1. `pnpm add citestyle`
2. Import the styles it actually uses (tree-shaking wins — only imported styles end up in the bundle):
   ```js
   import { format } from 'citestyle'
   import * as apa from 'citestyle/styles/apa'
   ```
3. Create a specialized section component (e.g., `Publications`) that maps over the data and calls `format()` per entry:

   ```jsx
   import { format } from 'citestyle'
   import * as apa from 'citestyle/styles/apa'
   import { SafeHtml } from '@uniweb/kit'
   import {
       useDocumentOutput,
       H2,
       Paragraphs,
   } from '@uniweb/press/react'

   export default function Publications({ block, content }) {
       const publications = content?.data?.publications || []
       const formatted = publications.map((pub) => format(apa, pub))

       // Preview: render citestyle's semantic HTML via kit's SafeHtml.
       // SafeHtml uses the runtime's sanitizing variant when available
       // and resolves Uniweb topic links — no dangerouslySetInnerHTML
       // boilerplate per entry.
       const preview = formatted.map((entry, i) => (
           <SafeHtml key={i} as="li" value={entry.html} />
       ))

       // Docx: use plain text (or richer markup built from entry.parts)
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

### Data shape: CSL-JSON

`citestyle` expects entries in [CSL-JSON](https://docs.citationstyles.org/en/stable/specification.html#appendix-iv-variables) — the same format Zotero, Mendeley, and every other reference manager uses. If the source data is in a different format (like a Uniweb profile's publication section), the foundation maps it:

- **In the component** — fine for foundations with one citation component.
- **In a `handlers.data` hook** — cleaner when multiple components consume the same data. The `handlers.data` hook is designed but not yet wired into `Block`; add it when there's a concrete need (mirrors `handlers.content` as a 10-line addition).

### What's NOT in scope

- No citation helpers in `@uniweb/press/sdk`. The native API (`publications.map(p => format(apa, p))`) is already trivial — a helper adds a layer without removing any lines.
- No citation-aware anything in `@uniweb/loom`. The engine stays domain-neutral.
- No unilang syntax for citations. The language can't express the complexity, and smuggling structured data through strings is a bad pattern.

## Phase 1 Assessment

### What Was Correct

| Decision | Why it's sound |
|----------|---------------|
| Hook-based registration (WeakMap + context) | Concurrent-safe, Strict-Mode-safe, Block stays clean |
| Declarative attribute map | Data-driven, testable, extensible |
| parse5 instead of browser DOMParser | Testable in Node, no jsdom needed |
| Lazy-loaded format adapters | Foundation bundle stays small |
| No build step (raw source) | Matches kit convention |
| Heterogeneous format registration | docx ≠ xlsx ≠ pdf, the unifier is the hook |
| `useDocumentOutput(block, format, fragment, options)` | Explicit block reference, clean API |

### What Was Wrong

| Assumption | Reality |
|------------|---------|
| "Unilang is not used in production" | It IS used — Article.js instantiates placeholders before semantic parsing. Components receive clean content, which is why component-level grep found nothing. |
| "Template engine is out of scope" | It's a prerequisite for report content. Without it, `{family_name}` stays literal. |
| "The builder components just need thin wrappers" | Legacy Paragraph has `data` prop (styled string parsing), `format` modes (5+ layout patterns). Legacy has Images, Links, Lists, Paragraphs (plural). |
| "The docx adapter just needs basic elements" | Legacy DocxGenerator handles async images, page numbering, default headers/footers, firstPageOnly, bookmarks. |

### What's Missing (Complete Gap List)

**New package:**
- [ ] `@uniweb/loom` — Port TemplateCore (engine, tokenizer, functions, optionally Plain — see [plain.md](./plain.md))

**@uniweb/press — sdk entry point:**
- [ ] `instantiateContent()` — ProseMirror content tree walker with template instantiation
- [ ] `parseStyledString()` — HTML inline marks → styled text objects
- [ ] Utility functions: `makeCurrency`, `makeRange`, `makeParentheses`, `join`
- [ ] `convertMillimetersToTwip` re-export

**@uniweb/press — builder components:**
- [ ] `Paragraph` `data` prop — parse styled string, render TextRuns
- [ ] `Paragraph` `format` prop — twoColumnLayout/Wide/Justified, twoLevelIndentation, ordered-list-reversed
- [ ] `Paragraphs` (plural) — render array of paragraph strings
- [ ] `H1`-`H4` `data` prop — parse styled string in headings
- [ ] `Image` / `Images` — image with data-type="image", src, dimensions
- [ ] `Link` / `Links` — external/internal hyperlink detection
- [ ] `List` / `Lists` — nested bullet lists with data-bullet-level

**@uniweb/press — docx adapter:**
- [ ] `ImageRun` support with async fetch (`fetchImageData`)
- [ ] Page numbering (`_currentPage` → `PageNumber.CURRENT`, `_totalPages` → `PageNumber.TOTAL_PAGES`)
- [ ] Default "Page X of Y" header/footer (`createDefaultHeaderFooter`)
- [ ] `firstPageOnly` header/footer with `titlePage` property
- [ ] Async element creation (Promise.all for images)
- [ ] Bookmark support
- [ ] `addSectionSpacing` config option

**@uniweb/press — orchestrator:**
- [ ] Wire `applyTo` option from registration to adapter (first/all/odd/even)

## Updated Phase Plan

### Phase 1.5 — Template Engine + Component Enrichment

**Goal:** A foundation can take content with `{placeholders}`, instantiate it against profile data, and produce a real `.docx` with proper formatting.

1. **Create `@uniweb/loom` package**
   - Port Loom class, tokenizer, built-in functions
   - Port markdown-based test suite
   - Plain transpiler is optional (separate subpath, deferred to its own phase)

2. **Enrich builder components**
   - `Paragraph` with `data` prop (uses `parseStyledString`)
   - `Paragraph` with `format` modes (start with twoColumnLayout + ordered-list)
   - `Paragraphs` (plural)
   - `H1`-`H4` with `data` prop
   - `Image` / `Images`
   - `Link` / `Links`
   - `List` / `Lists`

3. **Create `/sdk` entry point**
   - `instantiateContent()`, `parseStyledString()`, utility functions

4. **Enrich docx adapter**
   - Image support (async fetch)
   - Page numbering
   - Default header/footer

5. **Integration test with real content**
   - Port one legacy component (e.g., UNB DynamicSection default format)
   - Verify output matches legacy

### Phase 2 — xlsx + Real-World Port

1. xlsx adapter (`exceljs` integration)
2. Port UNB ResearchFunding (tables, borders, cell formatting)
3. Port UNB Header (page numbering, firstPageOnly)
4. Multi-sheet xlsx support
5. Compare output: legacy `.docx` vs new `.docx`

### Phase 3 — PDF + Polish

1. PDF adapter (Paged.js vs react-pdf decision)
2. Remaining Paragraph format modes
3. Bundle size analysis
4. Documentation

### Phase 4 — University Delivery

1. Build new university reports on `@uniweb/press` + `@uniweb/loom`
2. Real content from CMS with unilang placeholders
3. Full report generation workflow

## References

### Legacy Code (provided by Xiang)

All at `.assets/report-system/`:

| Path | What it is |
|------|-----------|
| `app-engine/article.js` | Content instantiation bridge — template engine + semantic parser |
| `app-engine/input.js` | Data source fetching and filtering |
| `app-engine/printer_core.js` | Block walker, header/footer classification, document generation trigger |
| `app-engine/TemplateCore/` | Template engine: `template_engine.js`, `tokenizer.js`, `template_functions.js`, `plain_script.js` |
| `app-engine/DocumentGenerator/docxGenerator.js` | Docx assembly with async images, page numbering, default headers |
| `app-engine/DocumentGenerator/xlsxGenerator.js` | Xlsx assembly (xlsx@0.18.5) |
| `app-engine/ReportRenderer/` | Report preview page renderer |
| `report-sdk/` | SDK: builder components + htmlToDocx + utilities |
| `report-modules/src/UNB/` | UNB foundation: Section, DynamicSection, Header, Citation, ResearchFunding |
| `report-modules/src/SMU/` | SMU foundation: Section, DynamicSection, Header, Citation, Title, Submission |
| `docs/` | Unilang documentation (15 files) |
| `unilang-example.md` | Real unilang expressions from production |
| `unilang-example{1,2,3}.png` | Screenshots of Docufolio with unilang content |

### Legacy Code (original locations, for cross-reference)

| Path | What it is |
|------|-----------|
| `/Users/dmac/Proximify/report-sdk/` | npm package `@uniwebcms/report-sdk` v1.3.4 |
| `/Users/dmac/Proximify/report-modules/` | Production report foundations (UNB, SMU) |
| `/Users/dmac/Proximify/unirepo/js/frontend/plain/UniwebCore/` | Legacy Block, PrinterCore |
| `/Users/dmac/Proximify/unirepo/js/frontend/plain/TemplateCore/` | Template engine implementation |
| `/Users/dmac/Proximify/unirepo/js/frontend/plain/DocumentGenerator/` | DocxGenerator, XlsxGenerator |
| `/Users/dmac/Proximify/unirepo/js/tools/unitTests/` | Template engine test suite (markdown-based, 17+ categories) |

### Modern Uniweb Integration Points

| Package | Relevance |
|---------|-----------|
| `@uniweb/core` (block.js) | Block class — `output`/`input` already removed. `block.content` provides parsed content. |
| `@uniweb/core` (entity-store.js) | `EntityStore.resolve(block, meta)` — modern equivalent of `useCompleteProfiles` |
| `@uniweb/kit` | Standard hooks and components. Documents package mirrors kit conventions. |
| `@uniweb/semantic-parser` | Parses ProseMirror docs to `{ title, paragraphs, items, ... }`. Runs in Block constructor. |
| `/Users/dmac/Uniweb/csl/` | `@citestyle/*` — citation formatting. Foundation concern, not documents-package concern. |

### External Libraries

| Library | Purpose | Bundle size |
|---------|---------|-------------|
| `docx@^9` | Word document generation | ~400KB |
| `parse5@^7` | HTML parser (Node-compatible) | ~50KB |
| `exceljs` | Excel generation (phase 2) | ~700KB |

## Glossary

- **Template Engine** — Pure JS engine that evaluates `{placeholder}` expressions against a variable resolver. The `render()` method processes text with embedded placeholders; `evaluateText()` evaluates standalone expressions.
- **Unilang** — The expression language used by the template engine. Polish-notation functions, variable access, conditionals, sorting, aggregation.
- **Plain** — Optional English-like syntax that transpiles to Loom expressions at parse time. Designed to make Loom approachable to non-technical authors — "saying it in plain language" rather than memorizing Polish notation. Ships as a subpath export `@uniweb/loom/plain` with a `Plain` class. Originally prototyped under the working name "PlainScript" in 2018–2020. See [plain.md](./plain.md).
- **Instantiation** — The process of replacing `{placeholders}` in content with resolved values from a data source (profile, collection, etc.).
- **Article** — Legacy class that bridges content, profile data, and the template engine. Modern equivalent is the `instantiateContent()` function in `@uniweb/press/sdk`.
- **Docufolio** — The legacy CMS UI for designing reports. Users select CV sections, write unilang strings, and assign React components.
- **Block** — Modern Uniweb runtime representation of a section. `block.content` provides parsed content.
- **IR** — Intermediate Representation. Object tree produced by `htmlToIR()`, consumed by format adapters.
- **Builder component** — React component from `@uniweb/press/react` that renders semantic HTML with `data-*` attributes.
- **Format adapter** — Lazy-loaded module that converts IR/data to a document Blob.

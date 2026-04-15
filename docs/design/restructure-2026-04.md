# Press restructure — plan

**Status:** Ready to execute
**Author:** Diego (with Claude)
**Last updated:** 2026-04-14

This document is the execution plan for the `@uniweb/press` phase-1.6 restructure. It follows eight rounds of review across two conversations. The review trail is preserved at `restructure-2026-04-revision-history.md` (in this same directory). The original Press/Loom design doc — the source-of-truth for decisions inherited from phase 1 — is preserved verbatim at `historical/original-press-package-design.md` (in this same directory).

Press is **unpublished** — no production consumers — so this restructure is a clean break with no back-compatibility shims. The goal is principled architecture that ships correctly, not migration smoothness.

## 0. Before starting (context for a fresh session)

If you're picking this up in a new conversation with no prior context, read this section first. It gives you the working directory, the files to Read for context, sibling package locations, test commands, workspace conventions, and git strategy — everything you need before touching any source.

### Working directory

```
/Users/dmac/Proximify/uniweb/framework/press/
```

All relative paths in this plan (e.g., `src/index.js`, `tests/sdk/...`, `examples/preview-iframe/`) are relative to that directory. Paths outside the Press package are either workspace-relative (starting with `framework/`, `apps/`, `platform/`, `kb/`, `scripts/`) or explicitly marked as user-home (`~/...`, per-machine).

### Read these first (required context)

Before starting any phase, Read these files in order so you understand the package, the scope conventions, and the workspace conventions:

1. **This plan**, end to end. You're probably reading it now.
2. **`CLAUDE.md`** (the Press package one, at `framework/press/CLAUDE.md`) — package-specific conventions, file layout as it exists today, and gotchas. Note: this file gets rewritten in Phase R4b after R3 lands, so if you're executing R1–R3, the current version describes the *pre-restructure* state.
3. **`framework/CLAUDE.md`** — framework-scope conventions and critical gotchas. Contains the 20+ gotchas list (ESM, prerender dual-React, import maps, foundation-site architecture) that apply to anything under `framework/`.
4. **`uniweb/CLAUDE.md`** (workspace root) — workspace-level conventions: what Uniweb is, scoped monorepo layout, public-vs-private boundary (framework is public, apps/platform are private), test terminology, path conventions.
5. **`framework/press/package.json`** — current exports field, current dependencies, current test scripts. R3 rewrites the exports field; you need to see the current state to make the diff legible.
6. **`framework/press/src/`** listing (Bash `ls -R`) — current source layout. R3 moves a lot of these; you need to know what's there to move it.

### Optional context (depth, not execution)

These help if you want to understand *why* decisions were made. Not required to execute:

- **`framework/press/docs/design/restructure-2026-04-revision-history.md`** — the full eight-round review trail that produced this plan. Read if you want to see how a decision was reached.
- **`framework/press/docs/design/historical/original-press-package-design.md`** — the original pre-restructure design doc. Source of truth for phase-1 decisions, the citations design, and the foundation-handlers architecture.

### Sibling packages (locations, not imports)

Paths inside the workspace that this plan touches:

| Package | Path | Role in this plan |
|---|---|---|
| `@uniweb/press` (this) | `framework/press/` | The subject of the restructure |
| `@uniweb/loom` | `framework/loom/` | Phase R2 adds `instantiateContent` as a root-level export |
| `@uniweb/kit` | `framework/kit/` | Reference for the no-build-step convention (Press mirrors kit). Also: **the public surface** for runtime primitives foundations need — `ChildBlocks`, hooks, etc. Foundations import from kit, never directly from runtime. |
| `@uniweb/core` | `framework/core/` | Contains `block.js` which hosts the `handlers.content` hook; `entity-store.js` for future `handlers.data`. Framework-internal — foundations don't import from here. |
| `@uniweb/runtime` | `framework/runtime/` | **Internal infrastructure — foundations never import from this directly.** Contains `setup.js` where the `capabilities` nesting bug lives (framework-handlers work item 1 in §6). Its React primitives (`ChildBlocks`, etc.) are re-exported by `@uniweb/kit` for public consumption. |
| `@uniweb/cli` | `framework/cli/` | Contains `templates/foundation/src/foundation.js.hbs` scaffold and `partials/agents.md` public guide |

All of these are in the same git monorepo but each has its own tracked sub-repo (cloned, not submodules). Check out all of them before starting — a fresh clone of `framework/press/` alone won't have Loom or the others.

**Public vs. internal boundary for foundation authors:** foundations import from `@uniweb/press`, `@uniweb/press/*`, `@uniweb/kit`, and `@uniweb/loom` (if they need template instantiation). Foundations do **not** import from `@uniweb/runtime` or `@uniweb/core` — those are framework internals. Kit is the public surface for any React primitive foundations need. When in doubt about what's public, check `@uniweb/kit`'s exports first.

### Test and build commands

All commands run from `framework/press/` unless stated:

```bash
pnpm test                          # vitest run — unit tests for Press
pnpm test:watch                    # vitest watch mode
pnpm test tests/docx/              # run one test dir
pnpm test -t 'inline marks'        # run by test name

# For Loom work in R2:
cd ../loom && pnpm test            # Loom's tests

# For bundle verification (R1 and R3 exit criteria):
# — see "Bundle verification" below
```

There is **no `pnpm build`** for Press. Press ships raw source; the `exports` field points directly at `./src/...`. Consumers (foundations) bundle via Vite themselves. Do not introduce a build step.

### Bundle verification (R1 and R3 exit criteria)

The exit criteria for R1 and R3 say "the `docx` library must only appear in a dynamic chunk, not the main chunk." The verification approach:

1. Create a minimal test consumer somewhere disposable (under `/tmp/` or in `framework/press/examples/bundle-check/` — wherever). A single `main.jsx` that imports `@uniweb/press` and `@uniweb/press/docx` (R1 can use the legacy `@uniweb/press/react` if that's still the current shape).
2. Run `pnpm vite build` in that consumer.
3. Inspect `dist/assets/`. The main chunk is `index-*.js`. If the `docx` library is hoisted into it, that file will be ~3.4 MB — trivial to spot by file size alone. The lazy chunk (containing the docx library) should appear as a separate `*-.js` file only, not inlined into the main chunk.
4. Optional: grep the main chunk for a distinctive `docx` library export like `PackerImpl` or `DocxDocument` — if it's there, the library is hoisted.

No specialized tool needed. File size is the primary signal.

### Workspace conventions (brief)

- **ESM only.** `"type": "module"` in every package.json. Import paths must include extensions (`./file.js`, not `./file`).
- **No TypeScript.** Plain JavaScript with JSDoc comments for documentation only — no `@type` annotations, no `tsc`. Don't introduce a project-wide TypeScript config.
- **No build step in Press.** `exports` points at `./src/...`. Edits are immediately effective in any linked workspace package.
- **pnpm workspace.** `workspace:*` references resolve between sibling packages during dev. `pnpm install` at the workspace root.
- **Node >= 20.19, pnpm 10.x.**
- **Formatting:** no semicolons, single quotes, 2-space indent (applies to all `@uniweb/*` packages). Prettier configs handle this automatically.
- **Public vs. private:** every repo under `framework/` is public on `github.com/uniweb`. Never leak references to the private `apps/` or `platform/` scopes into Press code, comments, or docs. See `framework/CLAUDE.md` for the full rules.

### Git strategy

- **Each phase lands as its own commit or small PR.** R1, R2, R3, R4a, R4b, R4c, R4d, R5. The framework-handlers work (§6) is tracked in a separate branch/PR since it lives in `framework/runtime/`, `framework/core/`, `framework/cli/`, not in Press.
- **R3's `src/docx/` flip CAN be staged as two commits** if the reviewer prefers: first "move adapter out of `src/docx/` to `src/adapters/docx.js`" (leaves `src/docx/` empty), then "populate new `src/docx/` with builder components." This is optional — a single coordinated commit is also fine because Press is unpublished.
- **Do not force-push to main.** Do not amend published commits. Each phase is a new commit; if a hook fails, fix and re-commit.
- **Commit messages:** follow the existing Press repo convention (check `git log` before starting). Framework commits describe the foundation-author impact, not internal motivation, because the repos are public.

### User-specific paths (R5 only)

R5's reference foundations live **outside the workspace** at per-user paths:

- `~/Uniweb/workspace/.assets/report-system/report-modules/src/` (three docx reports)
- `~/Proximify/innovation-modules/src/Publications/` (xlsx + charts + citations case)

These paths are Diego's machine; other users resolve them locally. A fresh session on a different machine should ask the user to confirm or provide the paths at R5 time — do not invent paths or assume they exist. R5 is weeks away from R1, so this isn't a concern for the first few phases.

### Skills available in this workspace

If you're running from the Uniweb workspace root, the following slash commands are available (check `framework/CLAUDE.md` "Skills" section for the current list):

- `/test-quick`, `/test-local`, `/test-npm` — end-to-end framework testing via sandbox projects
- `/template-dev`, `/template-sync` — template development
- `/load-framework`, `/load-apps`, `/load-platform`, `/load-context` — load scope CLAUDE.md context mid-session

None of these are strictly required to execute this plan, but `/test-local` is useful for R3 exit criteria verification after the restructure lands.

## 1. Summary

Press phase 1 shipped with four public subpaths (`.`, `/react`, `/sdk`, `/docx`) organized by runtime (React vs. vanilla) rather than by audience. That organization didn't hold up: the `/react` subpath was actually 100% docx-shaped, `/sdk` was a catch-all of four unrelated things that belonged in three different packages, the root barrel silently broke lazy-loading of the docx adapter, and the `DownloadButton` component forced UI opinions into a library that isn't a UI kit.

The phase-1.6 restructure re-organizes Press around **format partitioning**: the root is a format-agnostic core (registration machinery, compile pipeline, download utility), and each output format lives at its own subpath (`/docx` today; `/xlsx`, `/pdf` later). A new `/sections` subpath houses higher-level section templates — the generic `Section` that combines registration and rendering, and the opinionated `StandardSection` that renders Uniweb's standard content shape. The IR walker moves to `/ir` where custom-adapter authors can reach it. Loom gains the `instantiateContent` helper as a root-level export, moved from Press's old `/sdk`, because it belongs in the template-engine layer upstream of Press.

Press ships a runnable `examples/preview-iframe/` demo and an integration test that exercise the compile + preview + download flow — the primary use case for existing Proximify reporting foundations. Public docs are treated as a real ~1.5–2.5 day writing effort, not a README appendix. A legacy parity audit runs after the restructure stabilizes, targeting four concrete reference foundations.

## 2. The target shape

### 2.1 Public subpaths

```
@uniweb/press                     FORMAT-AGNOSTIC CORE
  ├─ DocumentProvider             context holding WeakMap<Block, Output>
  ├─ useDocumentOutput            registration hook (called by section components)
  ├─ useDocumentCompile           returns { compile, isCompiling }; compile() → Promise<Blob>
  └─ triggerDownload              utility: Blob → browser file download

@uniweb/press/docx                DOCX REACT PRIMITIVES (atoms)
  ├─ Paragraph, Paragraphs
  ├─ TextRun
  ├─ H1, H2, H3, H4
  ├─ Image, Images
  ├─ Link, Links
  └─ List, Lists

@uniweb/press/sections            SECTION TEMPLATES (molecules)
  ├─ Section                      generic register-and-render wrapper
  └─ StandardSection              opinionated Uniweb content-shape renderer

@uniweb/press/ir                  CUSTOM ADAPTER AUTHORING
  ├─ htmlToIR
  ├─ attributesToProperties
  ├─ attributeMap
  └─ compileOutputs

(future, added when adapters ship)
@uniweb/press/xlsx                XLSX primitives  — phase 2
@uniweb/press/pdf                 PDF primitives   — phase 3
```

The docx adapter itself (`compileDocx`, `buildDocument` and the 3.4 MB `docx` library) lives at an internal path — `src/adapters/docx.js` — that is **not** listed in `package.json` `exports`. It's reached only via `useDocumentCompile`'s dynamic import, preserving lazy-loading. A foundation that imports `@uniweb/press/docx` for its React builders does not pull in the `docx` library until `compile('docx')` is actually called.

### 2.2 Hello world

```jsx
import {
  DocumentProvider,
  useDocumentOutput,
  useDocumentCompile,
  triggerDownload,
} from '@uniweb/press'
import { H1, H2, Paragraph } from '@uniweb/press/docx'

function Cover({ block, content }) {
  const markup = (
    <>
      <H1 data={content.title} />
      <H2 data={content.subtitle} />
      <Paragraph data={content.body} />
    </>
  )
  useDocumentOutput(block, 'docx', markup)
  return <section>{markup}</section>
}

function DownloadControls() {
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

Two Press imports, one per concern: the format-agnostic machinery from the root, the docx React primitives from `/docx`. Foundations that do xlsx output in addition to docx add a third import from `/xlsx` when that adapter lands — symmetric, no special-casing.

### 2.3 Section templates

`@uniweb/press/sections` provides two layered helpers to eliminate the boilerplate every foundation rewrites.

**`Section` — generic register-and-render.** Zero content knowledge. Format-agnostic. Combines `useDocumentOutput` registration with a `<section>` wrapper in one call:

```jsx
export function Section({ block, format = 'docx', children, ...props }) {
  useDocumentOutput(block, format, children)
  return <section {...props}>{children}</section>
}
```

Usage:

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

**`StandardSection` — opinionated Uniweb renderer.** Built on `Section` + `/docx` primitives. Reads the standard Uniweb content shape (`title`, `subtitle`, `description`, `paragraphs`, `images`, `links`, `lists`) and renders it. Accepts an optional `renderChildBlocks` prop so foundations can delegate child-block recursion to their own rendering mechanism without coupling Press to `@uniweb/core`:

```jsx
import { H1, H2, H3, Paragraphs, Images, Links, Lists } from '../docx/index.js'
import { Section } from './Section.jsx'

export function StandardSection({
  block,
  content = block.content,
  format = 'docx',
  renderChildBlocks,
}) {
  return (
    <Section block={block} format={format}>
      {content.title && <H1 data={content.title} />}
      {content.subtitle && <H2 data={content.subtitle} />}
      {content.description && <H3 data={content.description} />}
      <Paragraphs data={content.paragraphs} />
      <Images data={content.images} />
      <Links data={content.links} />
      <Lists data={content.lists} />
      {renderChildBlocks && renderChildBlocks(block)}
    </Section>
  )
}
```

Foundations that need child-block recursion pass kit's `ChildBlocks` component (or equivalent) via the prop:

```jsx
import { ChildBlocks } from '@uniweb/kit'

function Fallback({ block }) {
  return (
    <StandardSection
      block={block}
      renderChildBlocks={(b) => <ChildBlocks from={b} />}
    />
  )
}
```

`@uniweb/kit` is the public foundation-facing API surface for shared React components, including `ChildBlocks`. Foundations never import from `@uniweb/runtime` directly — the runtime is internal infrastructure. Kit re-exports whatever runtime primitives foundations need, so `ChildBlocks` has a stable public location (`@uniweb/kit`) even as the runtime's internals evolve.

`StandardSection` itself does not import `@uniweb/kit` — doing so would pin Press to Uniweb-specific rendering and break the duck-typing story. The caller owns the child-block decision, passes a `renderChildBlocks` function, and `StandardSection` just calls it. Uniweb foundations pass kit's `ChildBlocks`; a non-Uniweb caller can pass anything else that makes sense in their context.

`StandardSection` duck-types on the content shape (`content.title`, `content.paragraphs`, etc.) — it does not import from `@uniweb/core`. A non-Uniweb project that produces the same content shape gets `StandardSection` for free.

`StandardSection` is the modern equivalent of legacy SMU `Section`, minus the `block.output` mutation and minus the handwritten `htmlToDocx` call — both replaced by `useDocumentOutput` going through the orchestrator.

### 2.4 What goes away

| Removed | Replacement |
|---|---|
| `@uniweb/press/react` | Registration machinery → root; builders → `/docx`. |
| `@uniweb/press/sdk` | `instantiateContent` → `@uniweb/loom`; `parseStyledString` → internal to `/docx`; formatting utilities → deleted after §5 R3 audit. |
| Root `htmlToIR`, `attributeMap`, `attributesToProperties` | `@uniweb/press/ir`. |
| Root `compileDocx`, `buildDocument` re-exports | Internal-only at `src/adapters/docx.js`. |
| `DownloadButton` component | Foundations write their own `<button>`, calling `useDocumentCompile` + `triggerDownload`. |
| `useDocumentDownload` hook | `useDocumentCompile` (returns Blob) + `triggerDownload` (handles DOM) as separate primitives. |
| Layout `Section` in `/docx` (18-line CSS wrapper) | Deleted. The name is reused for the register-and-render helper in `/sections`. |

### 2.5 Internal file layout

```
press/
├── package.json                   ← exports: ".", "./docx", "./sections", "./ir"
├── src/
│   ├── index.js                   ← exports DocumentProvider, useDocumentOutput,
│   │                                  useDocumentCompile, triggerDownload
│   ├── DocumentProvider.jsx       ← moved from src/react/
│   ├── DocumentContext.js         ← moved from src/react/
│   ├── useDocumentOutput.js       ← moved from src/react/
│   ├── useDocumentCompile.js      ← NEW: dynamic-imports adapter, returns { compile, isCompiling }
│   ├── triggerDownload.js         ← NEW: DOM utility extracted from old DownloadButton
│   │
│   ├── docx/                      ← PUBLIC /docx
│   │   ├── index.js               ← barrel (builders only — no Section)
│   │   ├── Paragraph.jsx
│   │   ├── TextRun.jsx
│   │   ├── Headings.jsx
│   │   ├── Image.jsx
│   │   ├── Link.jsx
│   │   ├── List.jsx
│   │   └── parseStyledString.js   ← INTERNAL helper (not in barrel)
│   │
│   ├── sections/                  ← PUBLIC /sections
│   │   ├── index.js               ← barrel: Section, StandardSection
│   │   ├── Section.jsx
│   │   └── StandardSection.jsx
│   │
│   ├── adapters/                  ← INTERNAL (not in exports)
│   │   └── docx.js                ← compileDocx, buildDocument
│   │
│   └── ir/                        ← PUBLIC /ir
│       ├── index.js               ← barrel: htmlToIR, attributeMap,
│       │                              attributesToProperties, compileOutputs
│       ├── parser.js
│       ├── attributes.js
│       └── compile.js             ← moved from src/orchestrator/
│
├── tests/
│   ├── core/                      ← provider, hooks, compile, triggerDownload
│   ├── docx/                      ← builders, adapter
│   ├── sections/                  ← Section, StandardSection
│   ├── ir/                        ← parser, attributes, compile
│   └── integration/               ← preview-flow, section-helpers
│
├── examples/
│   └── preview-iframe/            ← runnable Vite app demonstrating compile + preview + download
│
└── docs/
    ├── concepts.md
    ├── quick-start.md
    ├── api/{core,docx,sections,ir}.md
    ├── guides/{preview-pattern,custom-adapter,multi-block-reports,report-foundations,citations}.md
    ├── migration-from-phase-1.md
    └── design/
        ├── restructure-2026-04.md                   ← this file
        ├── restructure-2026-04-revision-history.md  ← review trail
        └── historical/
            └── original-press-package-design.md     ← pre-restructure design
```

Notable physical moves in §5 R3:
- **The `src/docx/` flip.** Existing `src/docx/` holds the adapter; it becomes `src/adapters/docx.js`. The new `src/docx/` holds builder components. Disorienting in a diff, correct as an end state.
- **Format-agnostic files at the top of `src/`.** Four files live alongside `index.js` — no `src/core/` directory, because four files don't warrant nesting and a nominal `core/` collides with `@uniweb/core` in the broader workspace.
- **`src/orchestrator/` folds into `src/ir/`.** `compileOutputs` is functionally a member of the IR layer (its main consumer is `htmlToIR`). Moving it makes `/ir` self-contained for custom-adapter authors.

## 3. Related architecture

Three concepts sit adjacent to Press. None of them are Press design decisions, but all three affect how Press is used and need to be understood by anyone reading this plan.

### 3.1 Foundation handlers — why Press stays format-focused

Press section components are built on a contract: by the time they run, `block.content` is already parsed into the standard shape (`title`, `paragraphs`, `items`, etc.), and any `{placeholder}` expressions in text nodes have already been resolved against dynamic data. Section components are oblivious to where the processing happened — they just render what they receive.

The processing happens **upstream of Press**, in the Uniweb runtime, via a foundation-declared lifecycle hook called a **content handler**. The foundation's `foundation.js` exports a `handlers` object; the runtime calls `handlers.content(content, block)` before semantic parsing. A report foundation wires up a Loom engine in its handler, instantiates placeholders against currently-fetched profile data, and returns clean content for the semantic parser:

```js
// foundation.js — report foundation
import { Loom, instantiateContent } from '@uniweb/loom'

const engine = new Loom()

export default {
  defaultLayout: 'ReportLayout',
  handlers: {
    content(content, block) {
      const data = block.content?.data
      if (!data) return content
      return instantiateContent(content, engine, (key) => data[key])
    },
  },
}
```

A foundation that doesn't need dynamic data (a regular static Uniweb site) simply doesn't declare handlers. Press section components work identically in both cases.

This architecture is what lets Press stay format-focused. Without handlers, Press would need a way to plug in template instantiation at the section-component level, and every Press consumer would end up duplicating Loom-integration code. With handlers, Press never sees placeholders — which means Press doesn't depend on Loom, doesn't need a template-engine abstraction, and doesn't document placeholder-resolution mechanics.

**Handlers are partially implemented in the framework and have open work items.** See §6 "Framework-level dependencies."

### 3.2 Citations — what Press deliberately doesn't do

Press does not ship citation formatting. Foundations that need bibliographies import `@citestyle/*` directly and use it at the component level. Three reasons:

1. **Citation formatting needs structural output** (`{ text, html, parts, links }`) — not just string substitution. Template placeholders can't express APA rules that depend on author count, date presence, container type, etc. It's not a template problem.
2. **Citations look different in preview vs. docx.** Preview wants HTML with clickable DOIs; docx wants plain text with positional tabs. That's the JSX-and-register pattern already working as intended — one component builds both representations from one `format()` call on the same data.
3. **Tree-shaking wins on the per-style-import model.** `import * as apa from 'citestyle/styles/apa'` keeps the foundation bundle small.

The recommended citation pattern (documented fully in R4c's `guides/citations.md`):

```jsx
import { format } from 'citestyle'
import * as apa from 'citestyle/styles/apa'
import { SafeHtml } from '@uniweb/kit'
import { useDocumentOutput } from '@uniweb/press'
import { H2, Paragraphs } from '@uniweb/press/docx'

export default function Publications({ block, content }) {
  const publications = content?.data?.publications || []
  const formatted = publications.map((pub) => format(apa, pub))

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
      <ol>
        {formatted.map((entry, i) => (
          <SafeHtml key={i} as="li" value={entry.html} />
        ))}
      </ol>
    </section>
  )
}
```

Preview uses `entry.html`; docx uses `entry.text`. Same source of truth, two representations.

### 3.3 Loom — where `instantiateContent` lives

`instantiateContent(doc, engine, vars)` is a ProseMirror tree walker that calls `engine.render(text, vars)` on every text node. It was originally in Press's `/sdk` subpath, packaged alongside other helpers. Phase 1.6 moves it to Loom as a named root-level export:

```js
import { Loom, instantiateContent } from '@uniweb/loom'
```

The move is justified on three grounds:

- **Engine-agnostic duck typing preserved.** The function accepts any object with a `.render(text, vars)` method. If a future language engine ever appears, the walker can be reused. Making it a method on the `Loom` class would lock it to Loom.
- **Foundation handlers live upstream of Press.** A foundation's content handler imports both the Loom engine and the `instantiateContent` walker — they're one concern (template engine + its tree adapter) in one package. Putting the walker in Press would have forced Press to take Loom as a peer dependency, which is architecturally wrong.
- **Press stays format-focused.** Not touching template-engine mechanics keeps Press's surface small and its dependencies minimal.

Press depends on Loom only if a foundation uses handlers — and handlers are invoked in the runtime, not in Press. So Press has no direct Loom dependency at all.

## 4. Migration

Phase-1 code won't run unmodified against phase-1.6. There are no deprecation shims. This migration note exists so readers holding old examples can convert them mechanically:

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
// DownloadButton: no replacement. Write a <button> that calls
//   useDocumentCompile + triggerDownload.
// parseStyledString: no replacement. Use <Paragraph data="..."> API.
// makeCurrency, join, etc.: deleted or inlined (see §5 R3 utility audit).
```

## 5. Phased plan

Five phases executed in order. Each phase is independently reviewable. R1 is the smallest unit and lands first because it establishes bundle-analyzer verification used by later phases. R5 (the legacy parity audit) runs after the restructure stabilizes.

The framework-level handlers work (§6) runs **in parallel** with R1–R3 and must complete before R4c can write its `report-foundations.md` guide.

### Phase R1 — Correctness preflight

Smallest unit of work. No restructure, just correctness.

- Remove `compileDocx`, `buildDocument` re-exports from `src/index.js`.
- Update the 1–2 tests that import `compileDocx` from the root to import from `src/docx/index.js` directly.
- Build a toy sandbox consumer (one-file foundation that imports `@uniweb/press` and `@uniweb/press/react`) and verify via Vite's build output that the `docx` library appears only in a dynamic chunk, not the main bundle.

**Exit criteria:**
- `pnpm test` green.
- Toy consumer's main chunk does not contain the `docx` library.

### Phase R2 — Loom gains `instantiateContent`

Self-contained in the Loom repo. Runs before R3 so Press can depend on the new Loom export.

- Create `loom/src/instantiate.js` — move `press/src/sdk/instantiate.js` verbatim. No behavior changes.
- Add `export { instantiateContent }` to `loom/src/index.js`.
- Move `press/tests/sdk/instantiate.test.js` to `loom/tests/instantiate.test.js`. Add one new test that uses a real `Loom` instance to exercise the integration end-to-end.
- Update `loom/README.md`:
  - Add a section documenting `instantiateContent`.
  - Update the existing cross-reference to `@uniweb/press/sdk` — it's now a root `@uniweb/loom` export.

Press's `src/sdk/instantiate.js` is **not yet deleted** — that happens in R3 along with the rest of the `src/sdk/` cleanup.

**Exit criteria:**
- `loom/` tests green including the new real-`Loom` integration test.
- Press's existing `instantiate.test.js` still runs (no Press changes yet).

### Phase R3 — Press surface restructure

The main event. After R2 lands. Split into prep → file moves → tests → exit gate.

#### R3 prep (before touching Press source)

- **Workspace-wide consumer grep.** Search for any external importers of `@uniweb/press/react`, `@uniweb/press/sdk`, or `parseStyledString`. Target paths: `framework/**`, `apps/**`, `platform/**`. Expected: zero matches.
- **Internal utility audit.** Grep Press's own `src/` and `tests/` plus the four R5 reference repos (§5 R5) for uses of `makeCurrency`, `makeParentheses`, `makeRange`, `join`. Classify each hit: "replaceable by Loom stdlib," "genuinely useful as JS helper," or "unused." Decide delete vs. keep per function. If any stay, they move to internal helpers next to their single caller — not a new `/sdk` subpath.
- **Adapter-lazy-load sanity check.** Write a small test consumer (one file, imports `@uniweb/press` + `@uniweb/press/docx`) and build it. Confirm the `docx` library only appears in a dynamic chunk. This is the same check as R1, re-run after the restructure.

#### R3 file moves and rewrites

One coordinated change. The `src/docx/` flip happens in one step — no intermediate name, no staged commit.

1. **Move the adapter out of `src/docx/`:** `src/docx/index.js` → `src/adapters/docx.js`. No code changes inside the file.
2. **Move the orchestrator into `src/ir/`:** `src/orchestrator/compile.js` → `src/ir/compile.js`. One import path fix inside (`../ir/parser.js` → `./parser.js`). Delete the empty `src/orchestrator/` directory.
3. **Move the React builders into `src/docx/`:** `src/react/components/*.jsx` → `src/docx/*.jsx`, *except* `Section.jsx`, which is **deleted** (18-line CSS wrapper, no docx pipeline interaction). Create `src/docx/index.js` as the new barrel exporting `Paragraph`, `Paragraphs`, `TextRun`, `H1`–`H4`, `Image`, `Images`, `Link`, `Links`, `List`, `Lists`. No `Section` export.
4. **Move `parseStyledString` into `src/docx/`:** `src/sdk/parseStyledString.js` → `src/docx/parseStyledString.js`. Update `src/docx/Paragraph.jsx`'s import path (`../../sdk/parseStyledString` → `./parseStyledString`). `parseStyledString` is **not** exported from the `src/docx/index.js` barrel.
5. **Flatten the format-agnostic files:** move `src/react/DocumentProvider.jsx`, `DocumentContext.js`, `useDocumentOutput.js` to the top of `src/` alongside `index.js`.
6. **Split the old `DownloadButton.jsx` into two new top-level files and delete the button:**
   - Create `src/useDocumentCompile.js` — extract the hook logic, return `{ compile, isCompiling }` where `compile(format, documentOptions?)` returns a `Promise<Blob>`. Does **not** call `triggerDownload`. Dynamic-imports the adapter at `./adapters/docx.js` (and future `./adapters/xlsx.js`, etc.).
   - Create `src/triggerDownload.js` — extract the DOM utility as a plain exported function.
   - Delete `src/react/DownloadButton.jsx`. The button component is not preserved.
7. **Rewrite `src/index.js`** — exports `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`. Nothing else.
8. **Update `src/ir/index.js`** to export `htmlToIR`, `attributesToProperties`, `attributeMap`, and `compileOutputs` (the last from `./compile.js` moved in step 2).
9. **Delete `src/react/`** (empty).
10. **Delete `src/sdk/`** — `instantiate.js` moved to Loom in R2; `parseStyledString.js` moved in step 4; utilities deleted or inlined per the R3 prep audit.
11. **Rewrite `package.json` `exports`:**
    ```json
    {
      "exports": {
        ".":          "./src/index.js",
        "./docx":     "./src/docx/index.js",
        "./ir":       "./src/ir/index.js"
      }
    }
    ```
    `/sections` is added in R4a, not R3. R3 ships with three public entries.

#### R3 test updates

- Update tests that import from `@uniweb/press/react` or `@uniweb/press/sdk` to use the new locations.
- `tests/docx/index.test.js` imports `compileDocx` from `../../src/docx/index.js` — update to `../../src/adapters/docx.js`.
- `tests/react/download.test.jsx` (tests the deleted `DownloadButton`) — replace with:
  - `tests/useDocumentCompile.test.jsx` — verifies `compile(format)` returns a valid docx Blob, transitions `isCompiling` correctly across async, and produces distinct Blobs on successive calls (no stale caching).
  - `tests/triggerDownload.test.js` — verifies the no-op path in non-browser environments and the `<a>` creation/click/remove in jsdom.
- Delete `tests/sdk/instantiate.test.js` (moved to Loom in R2).
- Delete `tests/sdk/parseStyledString.test.js` or inline its cases into `tests/docx/Paragraph.test.jsx`.
- Delete or keep `tests/sdk/utilities.test.js` per R3 prep audit outcome.

#### R3 preview-iframe demo and integration test

Built as part of R3. Anchors the new API against the primary use case; if the API can't express preview-before-download cleanly, the API is wrong.

**`examples/preview-iframe/`** — a minimal runnable Vite app, one page, no styling polish. Declared as a workspace package so local dev tracks Press's API automatically.

Structure:
```
examples/preview-iframe/
├── package.json           ← @uniweb/press + docx-preview as workspace deps
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx
    └── App.jsx
```

`App.jsx` (~60 lines): a `DocumentProvider` wrapping two or three `Section`-like components that register docx output using the real `@uniweb/press/docx` builders. A `PreviewControls` component holds `useDocumentCompile` and exposes two buttons:
- **Preview** — `compile('docx')` → `renderAsync(blob, containerEl)` from the `docx-preview` library, rendered into a sandboxed `<iframe>` target.
- **Download** — `compile('docx')` → `triggerDownload(blob, 'sample.docx')`.

The iframe render target provides style and event isolation from the host page (important in CMS contexts). Foundations that prefer a plain `<div>` can swap the target.

`docx-preview` lives in the example's own `package.json`. Press itself gains no new runtime dependency.

**`tests/integration/preview-flow.test.jsx`** — verifies structural guarantees the demo depends on, without actually running `docx-preview` in jsdom (its DOM expectations are fragile outside a real browser):

- Given a `DocumentProvider` with two registered blocks, `compile('docx')` resolves to a Blob with non-zero size and the `PK` magic bytes (valid ZIP envelope).
- `isCompiling` transitions `false → true → false` across the async call.
- Successive `compile` calls return distinct Blobs.
- `triggerDownload(blob, fileName)` is a no-op when `document === undefined`.

#### R3 exit criteria

- `pnpm test` green across all of Press.
- `pnpm test` green across all of Loom (regression check).
- Toy sandbox foundation that imports `@uniweb/press` and `@uniweb/press/docx` builds successfully via Vite.
- Bundle analyzer: `docx` library appears only in the dynamic chunk, not the main chunk.
- `Paragraph` builder still parses `data="Hello <strong>World</strong>"` correctly (catches mis-wired `parseStyledString` imports).
- `examples/preview-iframe/` runs: `cd examples/preview-iframe && pnpm install && pnpm dev`. Clicking Preview renders a visible document in the iframe; clicking Download produces a `.docx` file that opens correctly in Word.
- `tests/integration/preview-flow.test.jsx` passes.

### Phase R4 — Section helpers, docs, kb cleanup

R4 has four sequential sub-phases: code (R4a), internal docs (R4b), public docs (R4c), kb cleanup (R4d).

#### Phase R4a — `@uniweb/press/sections`

New subpath, two components. Runs after R3.

**Files:**
- `src/sections/index.js` — barrel exporting `Section`, `StandardSection`.
- `src/sections/Section.jsx` — generic register-and-render wrapper (~15 lines).
- `src/sections/StandardSection.jsx` — opinionated renderer with `renderChildBlocks` prop (~30 lines).
- `tests/sections/Section.test.jsx` — unit tests: registers output, renders children, accepts `format` prop, accepts extra HTML props.
- `tests/sections/StandardSection.test.jsx` — unit tests: gracefully handles missing content fields, reads from `block.content` by default, accepts `content` override, accepts `renderChildBlocks`, registers under the format prop.
- `tests/integration/section-helpers.test.jsx` — uses `StandardSection` inside a `DocumentProvider`, compiles to a Blob, verifies the compiled output has the expected content.
- `package.json` — `exports` field gains `"./sections": "./src/sections/index.js"`.
- `examples/preview-iframe/src/App.jsx` — updated to demo `<StandardSection>` alongside hand-built sections (serves as a structural check that the helper composes correctly).

**Exit criteria:**
- `pnpm test` green.
- `StandardSection` as the sole component of a test section produces a valid `.docx` with heading, paragraphs, images, and `renderChildBlocks` output.
- The preview-iframe demo still renders correctly after switching one section to `<StandardSection>`.

#### Phase R4b — Press internal docs

Fast, focused, ~2 hours of writing. Unblocks R4c by settling the internal story before the public story is drafted.

- Rewrite `press/CLAUDE.md` — file layout, public subpaths, gotchas, cross-references to this plan, pointer to the preview demo and integration tests.
- Rewrite `press/README.md`'s development / contributing section (short — setup, test commands, how to add a builder component, how to add a format adapter).
- Verify no lingering references to `/react`, `/sdk`, `DownloadButton`, `useDocumentDownload` in any internal doc, comment, or script.
- Grep for stale references to `@uniweb/documents` (the package's former name).

#### Phase R4c — Public user-facing docs

The big one. ~1.5–2.5 days of focused writing. Follows Loom's flat `docs/*.md` convention.

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
    │   └── ir.md                      ← custom-adapter authoring via htmlToIR, compileOutputs, attributeMap
    ├── guides/
    │   ├── preview-pattern.md         ← iframe vs. container, docx-preview integration, pointer to example
    │   ├── custom-adapter.md          ← building a non-docx format adapter using /ir
    │   ├── multi-block-reports.md     ← how DocumentProvider aggregates across multiple sections
    │   ├── report-foundations.md      ← end-to-end: foundation.js handlers → Loom → Press sections
    │   └── citations.md               ← citestyle + Press pattern for bibliographies
    └── migration-from-phase-1.md      ← for readers holding phase-1 examples
```

**Writing rules** (inherited from Loom's conventions):
- Lead with the use case, not the API.
- Every concept gets one runnable code example.
- Link sideways freely between guides and API references.
- Leave out things that aren't settled — no placeholder docs for xlsx/pdf adapters that don't exist.
- The README is an entry point, not a comprehensive reference; it has intro, hello world, and pointers into `docs/`.

**Prerequisite for `guides/report-foundations.md`:** the framework handlers work (§6 items 1, 2, 3) must be complete before this guide can describe the correct API. If that work hasn't landed when R4c reaches this file, the guide is deferred and R4c ships ten of eleven docs. `guides/citations.md` has no framework prerequisites and can be written any time.

**Exit criteria:**
- All docs files exist and are internally consistent (no dead links).
- README's hello world runs if copy-pasted into a Vite project.
- Every public export in §2 is documented somewhere under `docs/api/`.
- A reader who has never heard of Press can go from README → `quick-start.md` → `concepts.md` → `guides/preview-pattern.md` and have a working mental model.

#### Phase R4d — kb cleanup

R4d has its own review round before execution, because doc cleanups are easy to get wrong when planned and executed in bulk.

**Research step (no writes).** Read each of:
- `kb/framework/plans/documents-package.md` (576 lines) — phase-1 plan. Much is still authoritative (why Press exists, what it replaces, the heterogeneous-registration decision). Phase-1 implementation notes and "decisions in review" sections may be superseded.
- `kb/framework/reference/documents-package-design.md` — condensed design reference. Check for duplication.
- `kb/framework/reference/documents-legacy-references.md` — legacy code pointers, probably still useful verbatim.

**Proposal step.** Produce `press/docs/design/kb-cleanup-plan.md` listing, per file: what to keep, cut, rename, and redirect. Includes the filename question: the package renamed from `@uniweb/documents` to `@uniweb/press` in commit `83343e7`, so candidate renames are `documents-package.md` → `press-package.md`, etc.

**Review step.** The user confirms or edits the proposal. No kb edits land before confirmation.

**Execution step.** Apply the approved proposal: rename, consolidate, delete, redirect.

### Phase R5 — Legacy parity audit

Runs after the restructure stabilizes. Explicitly separated from R1–R4 because mixing "we changed the surface" with "we added features" would make either change hard to review. R5 is where "how good is Press vs. the legacy" gets a concrete answer.

#### Reference foundations

Four foundations covering both docx and xlsx patterns. These live **outside the workspace** at per-user paths — the paths below reflect Diego's machine and should be confirmed with the user at R5 time, not assumed:

1. **Three docx reports** under `~/Uniweb/workspace/.assets/report-system/report-modules/src/` — the directory holds multiple faculty-report components. Walk them at R5 time to identify the richest as the primary reference.
2. **`~/Proximify/innovation-modules/src/Publications/`** — the xlsx + chart + citation case. Same component produces a Nivo chart preview and a flat `{ headers, data }` xlsx output via `block.xlsx`. Also does formatted publication lists.

**Before starting R5:** ask the user to confirm both paths exist and are accessible. If the user has reorganized their local clones, they'll supply the replacement paths. Do not invent or assume paths.

Because xlsx adapter doesn't exist yet, the Publications audit splits:
- The registration side (calling `useDocumentOutput(block, 'xlsx', { title, headers, data })`) can be exercised today — the core provider/hook don't care what format is registered.
- The adapter side becomes the scoping document for phase 2's xlsx adapter.

The docx audit proceeds in full against the three report-modules foundations.

#### Audit method

1. Pick the primary docx reference (richest of the three).
2. Port it mechanically to `@uniweb/press` + `@uniweb/press/docx`. No redesign.
3. Produce legacy output `.docx` by running the original in its original environment.
4. Diff the two `.docx` files at the XML level (unzip, extract `word/document.xml`, normalize, diff).
5. Classify every discrepancy: **Press missing feature**, **Press bug**, **legacy quirk not worth replicating**, or **intentional difference**.
6. Repeat for the other two docx references — by this point the list is mostly confirming/adding to a punch list.
7. For the Publications foundation: audit the xlsx registration shape, document decisions for phase 2's adapter, audit the docx side for citation-specific features.

#### Known gaps from the original design doc

Named in the source-of-truth design, not speculation:

- **Paragraph `format` modes.** Legacy `report-sdk`'s `<Paragraph>` supported a `format` prop with at least five values: `twoColumnLayout`, `twoColumnLayoutWide`, `twoColumnLayoutJustified`, `twoLevelIndentation`, `ordered-list-reversed`. Used by complex CV sections (two-column funding tables, ordered publication lists). Current Press has no `format` prop. Decide per mode: keep, extract to separate utility components, or drop as domain-specific.
- **Bookmark support** in the docx adapter. Legacy emitted `Bookmark` elements for cross-references. Low priority unless a reference foundation uses them.
- **`addSectionSpacing`** config option. Legacy had per-document inter-section spacing config. Low priority.
- **`applyTo`** orchestrator wiring. The registration API accepts `{ role: 'header', applyTo: 'first' }` but the orchestrator currently ignores `applyTo` and classifies only by `role`. Fixing this unlocks first-page-cover-letter handling.

#### Feature gaps I suspect from reading the adapter

Hypotheses to verify or falsify during the audit:

- **TextRun color, size, font family.** Adapter reads `bold/italics/underline/style` but not `color/size/font`. If legacy supported these (probably yes), we're missing them.
- **Section breaks and page setup.** Adapter emits one `SectionType.CONTINUOUS` wrapping everything. No page breaks, no orientation mixing, no margin/size config.
- **Numbering style configuration.** Adapter reads `node.numbering.reference` but the `Document` constructor never gets `numbering: { config: [...] }` — numbered lists may render with Word's generic defaults instead of configured styles.
- **List nesting.** The `<List>` builder exists but its implementation hasn't been audited in depth.

#### Beyond-legacy opportunities

During the audit, track capabilities where the legacy was weak or missing. Candidates:
- Native docx list numbering registration done right (not just reference-without-config).
- Auto-generated table of contents via `docx` library TOC support.
- Embedded charts via Recharts/Nivo → SVG → PNG. Deferred in the original plan; by R5 we'll know if Publications or the others actually need it.
- Corporate document themes analogous to `theme.yml` — configurable fonts, colors, margins, header/footer content.
- Cross-foundation style presets shared between the three reports.

#### R5 deliverable

An audit report at `press/docs/audits/2026-XX-legacy-parity.md` containing: XML-level punch list, per-gap decisions (fix now / defer / drop), beyond-legacy decisions, and any adapter changes that land as part of R5. Exit criteria: at least one reference foundation ports to Press with zero material XML diffs.

## 6. Framework-level dependencies

Press's R4c `report-foundations.md` guide depends on framework-level work that isn't in this plan but must happen before R4c executes. It can run **in parallel** with Press R1–R3, so there's ~8 weeks of lead time if execution starts with R1 now.

**Track this work separately at `kb/framework/plans/foundation-handlers.md`** — referenced from here but fenced so "Press restructure" and "framework handlers work" don't conflate.

### Critical (blocks R4c's `report-foundations.md` guide)

1. **Fix the `capabilities` nesting bug.** The runtime currently reads `foundation.default.capabilities` and assigns it to `foundationConfig`, meaning foundations have to write `{ capabilities: { handlers: { content } } }` — an extra level of nesting that was never intended. The intended shape is `foundation.default.handlers.content` (top-level).
   - Files: `framework/runtime/src/setup.js:295-305`, possibly `framework/build/src/foundation/config.js`, possibly `framework/runtime/src/index.jsx`.
   - Preserve backward compat only if any live foundation uses the nested shape (probably none — it's undocumented).

2. **Add a scaffold stub in the foundation template.** Update `framework/cli/templates/foundation/src/foundation.js.hbs` to include a commented-out `handlers` block:

   ```js
   export default {
     defaultLayout: 'MyLayout',

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

   Discoverability: new foundation authors see `handlers` exists without reading framework source.

3. **Document handlers in `framework/cli/partials/agents.md`.** The public foundation-authoring guide that ships as `AGENTS.md` in every new Uniweb project. Add a section covering: when to use handlers, the signatures, the lifecycle (`content` runs before semantic parsing; `data` runs after fetch before block attachment), the report-foundation use case (Loom + `instantiateContent`), and pointers to Press for the document-output side.

### High priority but deferred (not a blocker for anything in this plan)

4. **Implement `handlers.data`.** Mirror `handlers.content` in `framework/core/src/block.js`. Called after `EntityStore.resolve()` returns data to a block and before the component reads `block.content.data`. Signature `(data, block) => data`, matching `handlers.content`.

   **Important investigation note for item 4:** `DataStore` already has a `registerTransform(name, fn)` mechanism that applies named transforms per fetch config (`datastore.registerTransform('profiles', fn)`; fetch configs reference by name with `transform: 'profiles'`). This is a **different abstraction** — it operates at the data-source level and can't see block context, so it can't filter by `block.params`. It's not a substitute for `handlers.data`, but the right implementation site and scope needs study (block-level hook? entity-store-level hook? somewhere between?). Defer the implementation-site decision to whoever picks up item 4.

   Filters won't work without this hook. High priority in absolute terms, but deferred because it's not a precondition for Press R1–R5 or for R4c's guide (the guide can describe the content-handler pattern alone and cross-reference item 4 as "coming soon").

### Medium priority (polish)

5. **Error handling.** Current `handlers.content` catches thrown errors and logs them. `handlers.data` should do the same. Failed handlers should not crash the page.

6. **Typedef / JSDoc the `foundation.default` shape** somewhere centrally so it's discoverable. Current foundation config reference is scattered.

7. **Verify extensibility.** The handlers mechanism should accept future hook names (`citation`, `i18n`, `validation`, etc.) without runtime changes. Document this in `agents.md` as the extension point.

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bundle-size regression — the new shape accidentally pulls adapter into main chunk | Medium | Real — 3.4 MB `docx` library | R3 prep and exit criteria both verify via bundle analyzer against a toy consumer |
| The `src/docx/` flip in R3 is confusing to review | Certain | Review friction only | Staged commits in R3 if the reviewer prefers: first move adapter, then populate new builders dir |
| Framework handlers work not complete when R4c executes | Medium | R4c ships without `report-foundations.md`, tracks it separately | Framework work runs in parallel with R1–R3; start it immediately |
| `examples/preview-iframe/` demo bit-rots as Press's API evolves | Medium | Confuses readers; demo stops running | Add `pnpm build` of `examples/preview-iframe/` to R3 and R4a exit criteria |
| `docx-preview` rendering differs from Word's in ways that mislead | Medium | User sees something that looks right in preview but prints wrong | Frame the demo as "a preview," not WYSIWYG. R5 is where fidelity is actually audited. |
| Q5 utility audit reveals a helper we can't cleanly drop or home | Medium | Small — one file lives somewhere | If it happens: small internal-only `src/utils.js`. No new public surface. |
| `/sections` helpers become a dumping ground for miscellaneous foundation helpers | Low-medium | Bloated scope | Keep `/sections` focused on section templates only. If non-section helpers accumulate, split into a separate subpath or promote to a package. |
| R5 legacy parity audit surfaces a missing feature that requires restructure-breaking changes | Low | Rework of R3 decisions | The architecture is format-agnostic at the core and format-specific at the adapter; most legacy features will fit within the existing shape. |

## 8. Out of scope

Things that are real work but not part of this plan, so they don't get lost:

- **xlsx adapter** (phase 2 per the original plan). Registration side works today; the adapter itself is deferred.
- **pdf adapter** (phase 3). Paged.js vs `@react-pdf/renderer` decision deferred until phase 3 scope.
- **Multi-page document assembly** (`website.compileDocument({ pages, headers, footers })`). Designed but deferred.
- **Charts inside docx/pdf** via Recharts/Nivo → SVG → PNG embedding. Deferred until a reference foundation needs it — R5 answers that.
- **Corporate document themes** analogous to `theme.yml`. Interesting future direction, not in this phase.
- **Foundation handlers implementation work** — tracked at `kb/framework/plans/foundation-handlers.md` (to be created). Items 1, 2, 3 in §6 are prerequisites for R4c; item 4 (`handlers.data`) is high priority but deferred; items 5–7 are polish.
- **Real-world port of a university foundation end-to-end** — happens in or after R5.

## 9. File map

Consolidated view of every file touched by this plan. For reviewer navigation.

### R1
- `src/index.js` — remove `compileDocx`/`buildDocument` re-exports.
- `tests/docx/index.test.js` — one import path update if needed.

### R2 (Loom)
- `loom/src/instantiate.js` — NEW (moved from `press/src/sdk/instantiate.js`).
- `loom/src/index.js` — gains `export { instantiateContent }`.
- `loom/tests/instantiate.test.js` — NEW (moved + new real-Loom integration test).
- `loom/README.md` — add `instantiateContent` section; update Press cross-reference.

### R3 (Press main restructure)
- `src/index.js` — rewrite to export format-agnostic four.
- `src/DocumentProvider.jsx`, `DocumentContext.js`, `useDocumentOutput.js` — moved from `src/react/`.
- `src/useDocumentCompile.js` — NEW.
- `src/triggerDownload.js` — NEW.
- `src/docx/` — REPURPOSED: builders only, no Section, `parseStyledString.js` as internal helper.
- `src/adapters/docx.js` — NEW (moved from old `src/docx/index.js`).
- `src/ir/compile.js` — moved from `src/orchestrator/compile.js`.
- `src/ir/index.js` — extended to export `compileOutputs`.
- `src/react/` — DELETED.
- `src/sdk/` — DELETED.
- `src/orchestrator/` — DELETED.
- `package.json` — `exports` rewritten: `.`, `./docx`, `./ir`.
- `tests/` — subdirectory moves, deletions, and new compile/download tests.
- `examples/preview-iframe/` — NEW workspace package: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`.
- `tests/integration/preview-flow.test.jsx` — NEW.

### R4a
- `src/sections/index.js` — NEW.
- `src/sections/Section.jsx` — NEW.
- `src/sections/StandardSection.jsx` — NEW.
- `tests/sections/Section.test.jsx` — NEW.
- `tests/sections/StandardSection.test.jsx` — NEW.
- `tests/integration/section-helpers.test.jsx` — NEW.
- `package.json` — `exports` gains `./sections`.
- `examples/preview-iframe/src/App.jsx` — updated to demo `StandardSection`.

### R4b
- `CLAUDE.md` — rewrite.
- `README.md` — update Development section.

### R4c
- `README.md` — rewrite intro, hello world, pointers.
- `docs/concepts.md` — NEW.
- `docs/quick-start.md` — NEW.
- `docs/api/core.md` — NEW.
- `docs/api/docx.md` — NEW.
- `docs/api/sections.md` — NEW.
- `docs/api/ir.md` — NEW.
- `docs/guides/preview-pattern.md` — NEW.
- `docs/guides/custom-adapter.md` — NEW.
- `docs/guides/multi-block-reports.md` — NEW.
- `docs/guides/report-foundations.md` — NEW (depends on §6 items 1, 2, 3).
- `docs/guides/citations.md` — NEW.
- `docs/migration-from-phase-1.md` — NEW.

### R4d
- `press/docs/design/kb-cleanup-plan.md` — NEW (pre-execution proposal, reviewed before execution).
- `kb/framework/plans/documents-package.md` — consolidated/renamed/redirected.
- `kb/framework/reference/documents-package-design.md` — consolidated/renamed/redirected.
- `kb/framework/reference/documents-legacy-references.md` — updated for package rename.

### R5
- `press/docs/audits/2026-XX-legacy-parity.md` — NEW.
- Adapter changes fall here as they're discovered.

### Framework (parallel track, tracked separately)
- `framework/runtime/src/setup.js` — fix `capabilities` nesting bug.
- `framework/cli/templates/foundation/src/foundation.js.hbs` — scaffold stub.
- `framework/cli/partials/agents.md` — handlers documentation.
- `framework/core/src/block.js` — `handlers.data` implementation (deferred).
- `kb/framework/plans/foundation-handlers.md` — NEW plan doc.

## 10. Execution readiness

All design decisions are settled. No open questions. The next conversation can begin at R1 without further design work.

**Start order:**
1. **R1** — Press correctness preflight. Small, standalone.
2. **R2** — Loom gains `instantiateContent`. Self-contained in Loom repo.
3. **Framework handlers work** (§6 items 1, 2, 3) — runs in parallel with R3, needs to complete before R4c. Create `kb/framework/plans/foundation-handlers.md` first as the tracking home.
4. **R3** — Press main restructure. Largest single change.
5. **R4a** — Section helpers. Small, builds on R3.
6. **R4b** — Internal docs. Fast.
7. **R4c** — Public docs. ~1.5–2.5 days of focused writing. Requires framework work to be complete for `report-foundations.md`.
8. **R4d** — Kb cleanup. Has its own review round before execution.
9. **R5** — Legacy parity audit.

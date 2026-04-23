# Paged.js running content — design (deferred)

**Status:** **deferred** — design shelved pending real author need. Do not implement yet. When an author actually asks for customized running content in a book PDF, this doc is the starting point.
**Last updated:** 2026-04-23.
**Scope:** would extend the shipped Paged.js adapter (`./pagedjs-adapter.md`) with a book-foundation-level convention for running headers and footers.

---

## Why this is deferred

The current default stylesheet (in `@proximify/book-pagedjs-default` and `DEFAULT_STYLESHEET` inside the Paged.js adapter) already produces good running content for the common book case: chapter name in the outer top corner via `string-set: chapter content()`, page number in the outer bottom corner via `counter(page)`. Both verso/recto variants are handled. A site that produces a book PDF today gets correct, book-typography-appropriate margin boxes without any configuration.

The proposal below would add a structured `book.running` block in `site.yml` for authors who want to customize running content without writing CSS. That's a lateral move from "author writes CSS" to "author writes YAML," both requiring a line or two of configuration. It's not an obvious improvement until a real author says they want the YAML form.

**Until then**, authors who need customization pass extra CSS rules through `adapterOptions.stylesheet`:

```js
import { stylesheet as defaultCss } from '@proximify/book-pagedjs-default'

const extraCss = `
  @page :left  { @top-left  { content: "My Book Title"; } }
  @page :right { @top-right { content: string(chapter); } }
`

adapterOptions: {
  mode: 'html',
  stylesheet: defaultCss + '\n' + extraCss,
  // ...
}
```

One-line escape hatch. No framework change required.

## The proposal, for when the need arises

### Convention

One block in `site.yml`:

```yaml
book:
  running:
    # Minimal case — one line, adds "Page N / Total" in outer bottom corner.
    footer: "{page} / {total}"
```

Full surface, all keys optional:

```yaml
book:
  running:
    header:        "{book.title} — {chapter}"
    header-verso:  "{book.title}"
    header-recto:  "{chapter}"
    footer:        "Page {page}"
    footer-verso:  "{page}"
    footer-recto:  "Page {page} of {total}"
```

### Placeholder syntax (no Loom)

A small dot-path substituter in the adapter, ~10 LOC. Two kinds of placeholders, no other features:

| Placeholder | Resolves | Becomes in CSS |
|---|---|---|
| `{x.y.z}` — any dot path into `runningVars` (e.g. `{book.title}`, `{book.author.family_name}`) | Compile time | Quoted string literal |
| `{chapter}`, `{section}`, `{page}`, `{total}` — reserved tokens | Runtime (browser) | `string(chapter)` / `string(section)` / `counter(page)` / `counter(pages)` |

No conditionals, no formatters, no transforms. Authors who want richer logic write CSS. The placeholders are **literal leaf tokens** — `{book.title}` substitutes a compile-time string, `{chapter}` emits a CSS function, that's the whole spec.

Parsing: one regex to find `{…}` spans; for each span, test against the reserved-token list first, then treat it as a dot path. If it's neither (e.g. misspelled token, unresolved path), throw with slot context.

Why not Loom: Loom's full language (filters, conditionals, formatters) would not work correctly on the runtime tokens (they're not strings until browser rendering), and the static-only subset authors would use is just `{x.y.z}` — five lines to implement. No dependency coupling, no "watch out for Loom transforms" gotcha.

### Position mapping (outer-corner default)

Four CSS-margin-box positions, six keys. Matches book typography and the current default stylesheet:

| Key | `:left` (verso) | `:right` (recto) |
|---|---|---|
| `header` | `@top-left` | `@top-right` |
| `header-verso` | `@top-left` | — |
| `header-recto` | — | `@top-right` |
| `footer` | `@bottom-left` | `@bottom-right` |
| `footer-verso` | `@bottom-left` | — |
| `footer-recto` | — | `@bottom-right` |

Authors who want center or inner positions extend the stylesheet directly. The adapter doesn't cover every Paged.js margin box.

### Implementation

All inside `src/adapters/pagedjs.js`. No new subpath, no external dependency.

**New adapter options:**

```js
compilePagedjs(input, {
  mode: 'html',
  stylesheet,
  meta,
  running: website.config.book?.running,           // raw YAML sub-object
  runningVars: { book: bookCfg, site: websiteCfg }, // data for {x.y.z} paths
})
```

**Adapter work:**
1. For each declared slot, parse `{…}` placeholders. Reserved tokens map to CSS functions; dot paths resolve via `runningVars`. Unresolved path → throw with slot name.
2. Emit CSS: literal segments quoted and CSS-escaped; reserved tokens emitted as their mapped CSS function; the parts joined with spaces to form a valid `content:` value expression.
3. Generate one `@page :left|:right { @top-left|@top-right|... { content: …; } }` rule per slot-side combination.
4. Inject a `<style>` block **after** the foundation stylesheet so author overrides win on cascade.

**Foundation work:** pass `running` and `runningVars` through `adapterOptions`. ~4 LOC per book foundation.

### Non-negotiables

- **Omitting `book.running` changes nothing** — default stylesheet runs unmodified.
- **Layout areas stay web-only** — no automatic passthrough.
- **Allowlist is stable** — `chapter`, `section`, `page`, `total` in v1. New tokens require a design amendment.
- **No Loom.** A simple dot-path substituter does the job.
- **Adapter-internal.** No new subpath or external module until a second consumer appears (principle 6).

### Testing (when implemented)

~6 test cases in `tests/pagedjs/adapter.test.jsx`:
1. Static-only template → quoted CSS string literal.
2. Single reserved token → matching CSS function.
3. Mixed static + reserved → concatenated CSS value.
4. CSS-string escaping (`"` → `\"`, `\` → `\\`).
5. Variant mapping: `header-verso` only emits `@page :left`.
6. Unresolved dot path throws with slot name.

### Pre-merge verification (if/when implemented)

Confirm Paged.js resolves `counter(pages)` to the post-pagination total page count. If broken, drop `{total}` from the allowlist.

### Size estimate

~60 LOC added to `src/adapters/pagedjs.js` + ~8 LOC across two foundations + 6 tests. One commit per repo.

## What this is NOT

- Not a way to reuse web layout areas in print.
- Not a new Press format.
- Not programmatic per-page logic — that's CSS.
- Not a new template language, not even Loom — a tiny dot-path substituter.
- Not a priority until an author asks for it.

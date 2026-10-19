# invoice-fixtures

Test harness and visual-review fixtures for the professional-docx work.

## Layout

```
_harness.js              compileInvoice(jsx, options) + verifyDocx(buffer)
build-fixtures.js        CLI: compile every fixture to out/ for visual review
stage-N-*.jsx            One fixture per visual-progression stage; each is
                         also a vitest test that asserts verifyDocx passes.
out/                     Compiled .docx files (gitignored)
snapshots/               Curated reference docx files (added at Stage 5)
```

## Running

```bash
# Compile every fixture, verify Word-clean invariants, write to out/
cd framework/press && pnpm test:invoice

# Run only the integration tests for the fixtures
cd framework/press && pnpm vitest run tests/integration/invoice-fixtures/
```

Open the files in `out/` in Word (or LibreOffice) for side-by-side
visual review against the legacy invoice. Each stage's fixture should
visibly improve on the previous one.

## Adding a fixture

1. Create `stage-N-<name>.jsx` exporting a render function and a vitest
   `describe` block that exercises `compileInvoice` + `verifyDocx`.
2. Import the render function into `build-fixtures.js` and add a
   `FIXTURES` entry.
3. Run `pnpm test:invoice` and visually review the `.docx` output.

## What `verifyDocx` checks

The three Word-clean invariants from this package's `CLAUDE.md`:

1. Every `<wp:docPr>` `id` is unique across the document.
2. Every `<wp:docPr>` emits a `name=""` attribute.
3. No `word/media/<hash>.undefined` files.

Violating any of these makes Word complain on open. The harness throws
on the first violation, so test output points at the right invariant.

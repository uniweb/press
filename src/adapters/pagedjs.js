/**
 * Internal Paged.js format adapter.
 *
 * Consumes the compile-pipeline output for the `pagedjs` format — a
 * passthrough shape { sections: string[], metadata } — and produces a
 * complete HTML document wired to the Paged.js polyfill.
 *
 * Unlike the docx/typst adapters, Paged.js does NOT walk an IR. The rendered
 * HTML *is* the target format; walking JSX → HTML → IR → HTML would
 * round-trip and lose nested spans, inline styles, and data-* attributes the
 * foundation intentionally put there for CSS Paged Media to pick up.
 *
 * Two modes:
 *   - 'html' (Phase 1): return a text/html Blob. The caller loads it in a
 *     browser context (new tab or iframe). Paged.js paginates on
 *     DOMContentLoaded, the user prints to PDF.
 *   - 'server' (Phase 3 — stub): POST the HTML to a backend that runs
 *     headless Chromium + Paged.js and returns a PDF.
 *
 * This module is internal. It is NOT listed in package.json's exports field;
 * consumers reach it only via the dynamic import inside adapters/dispatch.js.
 *
 * Entry point: compilePagedjs(compiledInput, options) → Promise<Blob>
 */

// ============================================================================
// Public API
// ============================================================================

/**
 * Compile passthrough output into a Paged.js-ready HTML Blob (html mode)
 * or a PDF Blob (server mode).
 *
 * @param {Object} input - Output of compileOutputs(store, 'pagedjs').
 * @param {string[]} input.sections - Rendered HTML strings in registration
 *   order, one per body fragment.
 * @param {Object|null} [input.metadata] - Plain data object from the
 *   `role: 'metadata'` registration (title, author, isbn, …).
 * @param {Object} [options]
 * @param {'html'|'server'} [options.mode='html']
 * @param {Object} [options.meta] - Additional metadata to merge over the
 *   `metadata` registration (options.meta wins).
 * @param {string} [options.stylesheet] - Foundation-supplied CSS string.
 *   When omitted, DEFAULT_STYLESHEET is used.
 * @param {string} [options.polyfillUrl] - Override Paged.js polyfill URL.
 * @param {string} [options.endpoint] - Server-mode endpoint.
 * @returns {Promise<Blob>}
 */
export async function compilePagedjs(input, options = {}) {
    const { mode = 'html', meta = {}, stylesheet, polyfillUrl, ...rest } = options

    const sections = (input && input.sections) || []
    const body = sections.join('\n')
    const resolvedMeta = { ...(input?.metadata || {}), ...meta }
    const doc = emitDocument({
        body,
        meta: resolvedMeta,
        stylesheet,
        polyfillUrl,
    })

    if (mode === 'html') {
        return new Blob([doc], { type: 'text/html; charset=utf-8' })
    }

    if (mode === 'server') {
        return compileServerSide(doc, rest)
    }

    throw new Error(
        `pagedjs adapter: unknown mode "${mode}". ` +
            `Valid modes: 'html' (returns paged-ready HTML), 'server' (POSTs HTML to endpoint, receives PDF).`,
    )
}

// ============================================================================
// Server mode
// ============================================================================

/**
 * Server mode: POST the assembled HTML to an endpoint that runs headless
 * Chromium + Paged.js and returns a PDF. The endpoint is provided via
 * options.endpoint; the default matches the (future) Vite dev plugin at
 * /__press/pagedjs/compile.
 *
 * Wire protocol: multipart/form-data with one field named `document.html`
 * whose value is a Blob of text/html. Response is application/pdf.
 */
async function compileServerSide(htmlDoc, options = {}) {
    const endpoint = options.endpoint || '/__press/pagedjs/compile'

    const form = new FormData()
    form.append(
        'document.html',
        new Blob([htmlDoc], { type: 'text/html' }),
        'document.html',
    )

    let res
    try {
        res = await fetch(endpoint, { method: 'POST', body: form })
    } catch (err) {
        throw new Error(
            `pagedjs adapter (server mode): request to ${endpoint} failed. ` +
                `Is the dev server (or your compile endpoint) running? ` +
                `Original error: ${err.message || err}`,
        )
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '(no body)')
        throw new Error(
            `pagedjs adapter (server mode): ${endpoint} returned ${res.status} ${res.statusText}.\n${text}`,
        )
    }

    const blob = await res.blob()
    return blob.type === 'application/pdf'
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: 'application/pdf' })
}

// ============================================================================
// HTML document assembly
// ============================================================================

/**
 * Build the full HTML document. Exported for tests and for foundations that
 * want to inspect the emitted document before handing it to a browser.
 */
export function emitDocument({ body = '', meta = {}, stylesheet, polyfillUrl } = {}) {
    const lang = meta.language ?? 'en'
    const title = meta.title ?? 'Book'
    const css = stylesheet || DEFAULT_STYLESHEET
    const polyfill = polyfillUrl || DEFAULT_POLYFILL_URL

    return `<!doctype html>
<html lang="${escapeAttr(lang)}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
${emitMetaTags(meta)}    <style>${css}</style>
    <script src="${escapeAttr(polyfill)}" defer></script>
  </head>
  <body>
${emitMetadataBlock(meta)}${body}
  </body>
</html>`
}

/**
 * Emit a small set of standard `<meta>` tags for common metadata fields
 * (author, description, subject). Kept minimal; not all registered fields
 * translate to HTML meta tags cleanly, so the full set lives in the hidden
 * metadata block below.
 */
function emitMetaTags(meta) {
    const out = []
    if (meta?.author) {
        out.push(`    <meta name="author" content="${escapeAttr(meta.author)}" />`)
    }
    if (meta?.description) {
        out.push(
            `    <meta name="description" content="${escapeAttr(meta.description)}" />`,
        )
    }
    if (meta?.subject) {
        out.push(
            `    <meta name="subject" content="${escapeAttr(meta.subject)}" />`,
        )
    }
    return out.length ? out.join('\n') + '\n' : ''
}

/**
 * Emit a hidden `<div data-pagedjs-metadata>` block with inline `<span>`
 * elements for each metadata field. CSS `string-set: var-name content()`
 * can then pull the values into `@page` margin boxes via `string()`.
 *
 * The block is hidden by default in the DEFAULT_STYLESHEET (and any
 * reasonable replacement should do the same) but remains in the DOM so
 * Paged.js / authors can reference it.
 */
function emitMetadataBlock(meta) {
    if (!meta || typeof meta !== 'object') return ''
    const entries = Object.entries(meta).filter(
        ([, v]) => v != null && typeof v !== 'object',
    )
    if (!entries.length) return ''
    const spans = entries
        .map(
            ([key, value]) =>
                `      <span data-field="${escapeAttr(key)}">${escapeHtml(String(value))}</span>`,
        )
        .join('\n')
    return `    <div data-pagedjs-metadata hidden>\n${spans}\n    </div>\n`
}

// ============================================================================
// Escape helpers
// ============================================================================

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function escapeAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

// ============================================================================
// Defaults
// ============================================================================

/**
 * Pinned Paged.js polyfill URL. Pinning the version keeps renders stable
 * across rebuilds — bump deliberately when validating a new Paged.js release.
 */
export const DEFAULT_POLYFILL_URL =
    'https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.js'

/**
 * Minimal CSS Paged Media stylesheet — enough to produce a recognizable
 * book PDF without a custom foundation stylesheet. Foundations override by
 * passing `options.stylesheet`.
 */
export const DEFAULT_STYLESHEET = `
/* Hidden metadata block — the DOM carries it for CSS string-set / string() */
[data-pagedjs-metadata] { display: none; }

/* Page geometry — 6×9 US trade size */
@page {
  size: 6in 9in;
  margin: 0.75in 0.5in 0.75in 0.75in;
}
@page :left  { margin: 0.75in 0.75in 0.75in 0.5in; }
@page :right { margin: 0.75in 0.5in 0.75in 0.75in; }

/* Named string for running headers */
h1 { string-set: chapter content(); }
@page :left  { @top-left  { content: string(chapter); font-size: 9pt; color: #666; } }
@page :right { @top-right { content: string(chapter); font-size: 9pt; color: #666; } }

/* Page number footer */
@page :left  { @bottom-left  { content: counter(page); font-size: 9pt; } }
@page :right { @bottom-right { content: counter(page); font-size: 9pt; } }

/* Chapter openers: start on recto */
h1 {
  break-before: recto;
  page: chapter-opener;
  font-size: 22pt;
  margin-top: 2in;
}
@page chapter-opener {
  @top-left { content: none; }
  @top-right { content: none; }
}

/* Body typography */
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 11pt;
  line-height: 1.45;
  hyphens: auto;
}
p { margin: 0 0 0.75em; text-indent: 1.25em; }
p.lead, p:first-child { text-indent: 0; }
h2 { font-size: 14pt; margin: 1.5em 0 0.5em; page-break-after: avoid; }
h3 { font-size: 12pt; margin: 1.2em 0 0.4em; page-break-after: avoid; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 0.92em; }
pre {
  font-size: 9.5pt;
  padding: 0.8em;
  background: #f5f5f5;
  overflow: hidden;
  page-break-inside: avoid;
}
blockquote {
  border-left: 3px solid #ccc;
  margin: 1em 0;
  padding: 0 0 0 1em;
  color: #444;
  font-style: italic;
}
ul, ol { margin: 0.5em 0 0.75em 1.5em; }
figure { break-inside: avoid; }
`

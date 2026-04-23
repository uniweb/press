/**
 * Bridge between the React registration layer (DocumentProvider +
 * useDocumentOutput) and the format adapters (docx, xlsx, typst, pagedjs).
 *
 * Dispatch is table-driven via the adapter descriptor in
 * src/adapters/dispatch.js — each adapter declares:
 *
 *   consumes — the store key whose fragments feed this adapter.
 *              Foundations register under this key. Multiple adapters can
 *              share the same key (e.g. pagedjs and future EPUB both read
 *              'html'), so a foundation writes one registration and gets
 *              both formats.
 *   ir       — whether fragments are walked to IR (true: docx/typst) or
 *              passed through as-is (false: xlsx data objects, pagedjs
 *              HTML strings).
 *
 * useDocumentCompile is the typical caller; custom adapter authors can
 * invoke compileOutputs() directly via the @uniweb/press/ir subpath.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { htmlToIR } from './parser.js'
import { getAdapterDescriptor } from '../adapters/dispatch.js'

/**
 * Compile all registered outputs for a given format into the shape the
 * format adapter's compile function expects.
 *
 * @param {Object} store - The DocumentProvider store (from DocumentContext).
 * @param {string} format - Format identifier ('docx', 'xlsx', 'typst', 'pagedjs', …).
 * @returns {Object} Adapter input shape. Two shapes today:
 *   - IR-based (docx/typst):  { sections: IR[][], header, footer, metadata,
 *                               headerFirstPageOnly, footerFirstPageOnly }
 *   - Passthrough (xlsx):     { sections: Object[] }
 *   - Passthrough (pagedjs):  { sections: string[], metadata }
 */
export function compileOutputs(store, format) {
    const desc = getAdapterDescriptor(format)
    // Unknown format: surface the empty shape and let runCompile throw the
    // descriptive error. Callers that bypass runCompile (IR-subpath users)
    // get an empty IR-shape output — safe default.
    if (!desc) {
        return { sections: [], header: null, footer: null, metadata: null }
    }

    const outputs = store.getOutputs(desc.consumes) || []

    if (desc.ir) {
        return compileToIR(outputs, store)
    }

    // Passthrough branch — differs only in whether body fragments are
    // rendered through React first.
    //
    // - 'html' input shape: fragments are JSX; render each one to a static
    //   HTML string (preserves semantic HTML + data-* attributes the
    //   target adapter may pick up, e.g. CSS Paged Media selectors).
    // - Any other non-IR shape (xlsx, future data exports): fragments are
    //   plain values; keep them as-is.
    if (desc.consumes === 'html') {
        return compileHtmlPassthrough(outputs, store)
    }
    return compileDataPassthrough(outputs)
}

/**
 * IR branch — JSX → renderToStaticMarkup → htmlToIR → grouped by role.
 *
 * Four roles:
 *   - body (default): IR appended to `sections`.
 *   - header / footer: IR held as the single document header or footer.
 *   - metadata: fragment kept verbatim (no IR walk). Format adapters
 *     consume this for document-level properties (title, author, isbn, …).
 *     Fragments for the metadata role are plain data objects, not JSX.
 *
 * Header and footer registrations accept an `applyTo` option. When set
 * to `'first'`, the output carries `headerFirstPageOnly` /
 * `footerFirstPageOnly` booleans so format adapters can emit a
 * different-first-page section layout. Other `applyTo` values (`'all'`
 * default, `'odd'`, `'even'`) produce no flag.
 *
 * Registered fragments are React element trees captured during the live
 * page render. renderToStaticMarkup renders them afresh here, outside
 * the React tree the page rendered in — so any context the builders
 * consume (basePath for URL resolution, and any future cross-cutting
 * values like theme or locale) must be re-provided now. The provider
 * itself owns that knowledge via store.wrapWithProviders, so this file
 * stays ignorant of the specific contexts in play. Without this wrap,
 * builders fall back to context defaults and emit, for example,
 * un-prefixed URLs that the docx adapter's fetch() then 404s on.
 */
function compileToIR(outputs, store) {
    let metadata = null
    let header = null
    let footer = null
    let headerFirstPageOnly = false
    let footerFirstPageOnly = false
    const sections = []

    const wrap = store.wrapWithProviders || ((x) => x)

    for (const { fragment, options } of outputs) {
        const role = options.role || 'body'

        if (role === 'metadata') {
            // Metadata fragments are plain data objects. No IR walk.
            // Last registration wins — metadata is document-level, a single
            // set of properties per document.
            metadata = fragment
            continue
        }

        const html = renderToStaticMarkup(wrap(fragment))
        const ir = htmlToIR(html)

        switch (role) {
            case 'header':
                header = ir
                if (options.applyTo === 'first') headerFirstPageOnly = true
                break
            case 'footer':
                footer = ir
                if (options.applyTo === 'first') footerFirstPageOnly = true
                break
            default:
                sections.push(ir)
                break
        }
    }

    return {
        sections,
        header,
        footer,
        metadata,
        headerFirstPageOnly,
        footerFirstPageOnly,
    }
}

/**
 * HTML passthrough branch — JSX → renderToStaticMarkup → HTML string.
 * Consumed by Paged.js and any future HTML-string adapter (EPUB, etc.).
 *
 * Only `body` and `metadata` roles are consumed. Header/footer for
 * HTML-string adapters are typically handled by the adapter's own
 * wrapping mechanism (for Paged.js: CSS `@page` margin boxes declared in
 * the stylesheet, e.g. `@top-right { content: string(chapter); }`), not
 * as registered fragments.
 */
function compileHtmlPassthrough(outputs, store) {
    const wrap = store.wrapWithProviders || ((x) => x)
    let metadata = null
    const sections = []

    for (const { fragment, options } of outputs) {
        const role = options.role || 'body'
        if (role === 'metadata') {
            metadata = fragment
            continue
        }
        if (role !== 'body') continue
        const html = renderToStaticMarkup(wrap(fragment))
        sections.push(html)
    }

    return { sections, metadata }
}

/**
 * Plain-data passthrough (xlsx, future JSON exports). Fragments are not
 * JSX — they're domain objects the adapter defines. Collect in order.
 */
function compileDataPassthrough(outputs) {
    const sections = outputs.map(({ fragment }) => fragment).filter(Boolean)
    return { sections }
}

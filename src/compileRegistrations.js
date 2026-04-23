/**
 * compileRegistrations — render a React tree off-screen through a
 * DocumentProvider that owns an external store, collect every section's
 * registrations for a given format, and hand the aggregated store to
 * compileOutputs.
 *
 * The typical on-page compile flow uses `useDocumentCompile()`, which
 * reads registrations out of the live DocumentProvider that the current
 * page mounted. That captures only what's mounted — one chapter in a
 * multi-chapter book. `compileRegistrations` captures whatever subtree
 * you hand it, regardless of whether it's mounted in the live DOM.
 *
 * Intended consumers:
 *   - Whole-book Download buttons (foundation aggregates every page's
 *     blocks into a single tree, passes it here).
 *   - Build-time compile (uniweb build --book): same aggregation run at
 *     build time rather than on click.
 *   - Headless export pipelines (Mode 4 from the Press concepts doc).
 *
 * This function is sync in, async out — renderToStaticMarkup is sync,
 * compileOutputs is sync for the IR step, but the adapter returned to
 * useDocumentCompile's callers is async (produces a Blob). Callers should
 * await the returned compile promise themselves.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import DocumentProvider, { createStore } from './DocumentProvider.jsx'
import { compileOutputs } from './ir/compile.js'
import { runCompile, getAdapterDescriptor } from './adapters/dispatch.js'

/**
 * @param {any} elements - React element or array of elements. Whatever you
 *   pass here will be wrapped in a DocumentProvider and renderToStaticMarkup'd.
 *   Anything inside that calls `useDocumentOutput` contributes to the store.
 * @param {string} format - Format identifier matching a registered
 *   adapter ('typst', 'docx', …). Determines what role of registrations
 *   the compile pipeline pulls out.
 * @param {Object} [options]
 * @param {string} [options.basePath] - Forwarded to DocumentProvider so
 *   URL-consuming builders resolve absolute paths correctly.
 * @returns {Object} The compiled input shape the format adapter expects,
 *   ready to pass into that adapter's compile function.
 *
 * @example
 *   import { compileRegistrations } from '@uniweb/press'
 *   import { ChildBlocks } from '@uniweb/kit'
 *
 *   const blocks = website.pages.flatMap((p) => p.bodyBlocks || [])
 *   const compiled = compileRegistrations(
 *     <ChildBlocks blocks={blocks} />,
 *     'typst',
 *     { basePath: website.basePath },
 *   )
 *   // hand `compiled` to the typst adapter:
 *   const { compileTypst } = await import('@uniweb/press/adapters/typst')
 *   const blob = await compileTypst(compiled, { mode: 'sources', ... })
 */
export function compileRegistrations(elements, format, options = {}) {
    const { basePath } = options
    const store = createStore()

    renderToStaticMarkup(
        createElement(
            DocumentProvider,
            { store, basePath },
            elements,
        ),
    )

    warnIfEmptyRegistrations(store, format)
    return compileOutputs(store, format)
}

/**
 * Emit a one-time console warning when a compile finds no registrations
 * under the adapter's `consumes` key. Catches the commonest cause of an
 * "empty body" compile: foundation section components registered for a
 * different input shape than the one the selected format reads from.
 *
 * The warning names the input-shape key (what the foundation should
 * register under) rather than the output format, because that's where the
 * fix lives. Silent when at least one output is present. Guarded with a
 * Set so the same missed key only warns once per page.
 *
 * Unknown formats skip the warning — runCompile's "Unsupported document
 * format" error is the right signal, not a misleading "0 sections" note.
 */
const _emptyKeyWarned = new Set()
function warnIfEmptyRegistrations(store, format) {
    const desc = getAdapterDescriptor(format)
    if (!desc) return
    const key = desc.consumes
    if (_emptyKeyWarned.has(key)) return
    const outputs = (store.getOutputs && store.getOutputs(key)) || []
    if (outputs.length > 0) return
    _emptyKeyWarned.add(key)
    if (typeof console !== 'undefined' && console.warn) {
        const note =
            key === format
                ? `compileSubtree('${format}') found 0 registered sections. ` +
                  `Did any section component call useDocumentOutput(block, '${format}', ...)?`
                : `compileSubtree('${format}') found 0 sections registered under input key '${key}'. ` +
                  `Sections should call useDocumentOutput(block, '${key}', ...) ` +
                  `(the output format '${format}' reads fragments registered under '${key}').`
        console.warn(
            `@uniweb/press: ${note} ` +
                `Sections registered for a different input key do not cross-register.`,
        )
    }
}

/**
 * Convenience: aggregate + dispatch the adapter in one call. Mirrors
 * `useDocumentCompile().compile(format, options)` but for off-screen
 * aggregation — returns a `Promise<Blob>`.
 *
 * The adapter is dynamic-imported inside runCompile, so Press's lazy-load
 * contract is preserved: importing `compileSubtree` does not pull the
 * adapter into the main bundle.
 *
 * @param {any} elements - React tree to aggregate registrations from.
 * @param {string} format - 'typst' | 'docx' | 'xlsx' | …
 * @param {Object} [options]
 * @param {string} [options.basePath] - DocumentProvider basePath.
 * @param {Object} [options.adapterOptions] - Format-specific adapter options
 *   (e.g., { mode: 'sources', meta, preamble, template } for typst).
 * @returns {Promise<Blob>}
 *
 * @example
 *   const blob = await compileSubtree(
 *     <ChildBlocks blocks={allBlocks} />,
 *     'typst',
 *     {
 *       basePath: website.basePath,
 *       adapterOptions: { mode: 'sources', meta, preamble, template },
 *     },
 *   )
 *   triggerDownload(blob, 'book.zip')
 */
export async function compileSubtree(elements, format, options = {}) {
    const { basePath, adapterOptions = {} } = options
    const compiled = compileRegistrations(elements, format, { basePath })
    return runCompile(format, compiled, adapterOptions)
}

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
import { runCompile } from './adapters/dispatch.js'

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

    return compileOutputs(store, format)
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

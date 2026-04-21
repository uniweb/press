/**
 * Provider that holds document output registrations.
 *
 * Wrap a report page (or a sub-tree of it) in <DocumentProvider> to enable
 * useDocumentOutput (in section components) and useDocumentCompile (in
 * whatever UI drives the download).
 *
 * The provider holds a WeakMap<block, Map<format, OutputEntry>> and exposes
 * a register function and a getOutputs function. The WeakMap ensures that
 * if blocks are unmounted and garbage-collected, their registrations don't
 * leak.
 *
 * Optional `basePath` tells Press how to resolve site-absolute URLs (e.g.
 * '/images/hero.png') under subdirectory deployments. Foundations pass
 * this from their runtime (for example `website.basePath` via
 * `useWebsite()`) — Press itself has no awareness of the host runtime.
 *
 * Usage:
 *
 *   <DocumentProvider basePath={website.basePath}>
 *     <SectionComponent block={block1} />
 *     <SectionComponent block={block2} />
 *     <DownloadControls />
 *   </DocumentProvider>
 *
 * Context propagation to the compile pipeline:
 *
 * The compile pipeline re-renders each registered fragment via
 * renderToStaticMarkup, which starts a fresh React tree with no
 * inherited context. DocumentProvider exposes `store.wrapWithProviders`
 * so the pipeline can re-wrap fragments in the same provider stack
 * they rendered under. Adding a new context that builders consume
 * (theme, locale, …) is one line inside wrapWithProviders — the
 * compile pipeline (src/ir/compile.js) needs no changes.
 */
import { createElement, useMemo } from 'react'
import { DocumentContext } from './DocumentContext.js'
import { BasePathContext } from './BasePathContext.js'

/**
 * @typedef {Object} OutputEntry
 * @property {any} fragment - The format-specific fragment (JSX for docx,
 *   data object for xlsx, etc.).
 * @property {Object} [options] - Registration options (role, applyTo, etc.).
 */

/**
 * Build a registration store — the same shape DocumentProvider creates
 * internally. Exposed so callers that need to aggregate registrations
 * outside a live React tree (e.g., a whole-site compile that walks pages
 * off-screen via renderToStaticMarkup) can own the store, render into it,
 * and read the results back.
 *
 * Usage:
 *
 *   import { createStore, DocumentProvider } from '@uniweb/press'
 *   import { renderToStaticMarkup } from 'react-dom/server'
 *
 *   const store = createStore()
 *   renderToStaticMarkup(
 *     <DocumentProvider store={store} basePath="/site">
 *       {allMyBlocksAsReactElements}
 *     </DocumentProvider>
 *   )
 *   const compiled = compileOutputs(store, 'typst')
 *
 * @returns {{ register, getOutputs, clear, wrapWithProviders }}
 */
export function createStore() {
    /** @type {WeakMap<Object, Map<string, OutputEntry>>} */
    const outputs = new WeakMap()

    // Track all registered blocks in insertion order so the walker can
    // iterate them. WeakMap is not iterable, so we maintain a parallel
    // array. Blocks that are GC'd will still be in this array as stale
    // refs, but the walker filters them out.
    const blockOrder = []

    return {
        register(block, format, fragment, options = {}) {
            let formatMap = outputs.get(block)
            if (!formatMap) {
                formatMap = new Map()
                outputs.set(block, formatMap)
                blockOrder.push(block)
            }
            formatMap.set(format, { fragment, options })
        },

        getOutputs(format) {
            const result = []
            for (const block of blockOrder) {
                const formatMap = outputs.get(block)
                if (!formatMap) continue
                const entry = formatMap.get(format)
                if (entry) {
                    result.push({ block, ...entry })
                }
            }
            return result
        },

        clear() {
            blockOrder.length = 0
        },

        // Reassigned by the provider so the compile pipeline can re-wrap
        // fragments with the same contexts they rendered under. Identity
        // function until the provider sets it.
        wrapWithProviders: (children) => children,
    }
}

export default function DocumentProvider({ children, basePath = '', store: externalStore }) {
    // Prefer an externally-provided store when the caller wants to own
    // the aggregation (for off-screen / whole-site compiles). Otherwise
    // build one internally — the common case for live page rendering.
    const store = useMemo(
        () => externalStore || createStore(),
        [externalStore],
    )

    // Expose the provider's full context stack as a closure so the
    // compile pipeline can re-wrap registered fragments with the same
    // contexts they rendered under — necessary because registrations
    // capture JSX element trees, not rendered output, and a later
    // renderToStaticMarkup(fragment) starts outside any React tree
    // (builders would otherwise fall back to context defaults and
    // emit, for example, un-prefixed URLs).
    //
    // Reassigned on every render so prop changes (basePath and any
    // future context values) flow through even though the store's
    // object identity is memoised.
    //
    // When adding a new cross-cutting context that builders consume
    // (theme, locale, author, …), wrap it here — the compile pipeline
    // does not need to change.
    const resolvedBasePath = basePath || ''
    store.wrapWithProviders = (children) =>
        createElement(
            BasePathContext.Provider,
            { value: resolvedBasePath },
            children,
        )

    return (
        <DocumentContext.Provider value={store}>
            <BasePathContext.Provider value={resolvedBasePath}>
                {children}
            </BasePathContext.Provider>
        </DocumentContext.Provider>
    )
}

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

/**
 * Full-document compile via a foundation's declared outputs.
 *
 * Where `compileSubtree` is the low-level "I already decided the tree,
 * give me bytes" primitive, `compileDocument` is the high-level "this
 * website, compiled as a <format> document through this foundation"
 * convenience. It handles three concerns compileSubtree doesn't:
 *
 *   1. Block selection — defaults to every page's bodyBlocks; a host
 *      can narrow the scope with `rootPath` (only pages under that
 *      route prefix).
 *   2. Foundation-supplied adapter options — looks up
 *      `foundation.outputs[format].getOptions(website, ...)` and
 *      merges its return into the options passed to compileSubtree.
 *      That's how a book foundation supplies preamble, template, meta,
 *      and asset bytes without the host knowing anything about them.
 *   3. Format aliasing — an output can declare `via: '<press-format>'`
 *      to route compile through a different Press adapter. A foundation
 *      can expose `outputs.pdf = { via: 'typst', ... }` so hosts ask
 *      for 'pdf' while Press produces a typst source bundle; the host
 *      (e.g., unipress) finishes the compile with the typst binary.
 *
 * Two call shapes:
 *
 *   - Tree mode: `compileDocument(<tree>, { format, ... })`.
 *     The first argument is a React element. Treated as a direct
 *     passthrough to compileSubtree — for hosts that already decided
 *     which blocks to include and assembled the tree themselves. The
 *     outputs lookup is skipped in this mode (no foundation needed).
 *
 *   - Website mode: `compileDocument(website, { format, foundation, rootPath, ... })`.
 *     The first argument is a Website instance (or any object with a
 *     `pages` array — we duck-type). Gathers blocks, builds the tree
 *     via `globalThis.uniweb.childBlockRenderer({ blocks })`, looks up
 *     `outputs[format]` on the foundation, calls its `getOptions`, and
 *     routes through compileSubtree with the resulting adapterOptions
 *     and basePath.
 *
 * The foundation argument accepts either the raw source shape (an
 * object with `.outputs`) or the built-module shape (`.default.capabilities.outputs`).
 * Browser Download buttons typically pass the source shape via a local
 * relative import; headless hosts like unipress pass the built module
 * they imported via URL.
 *
 * @param {import('react').ReactElement | Object} treeOrWebsite
 * @param {Object} [options]
 * @param {string} options.format - Output format name as declared on
 *   the foundation (e.g. 'typst', 'pdf', 'epub', 'pagedjs').
 * @param {Object} [options.foundation] - Foundation module, source or
 *   built. Required for website mode; ignored in tree mode.
 * @param {string} [options.rootPath] - Limit block gathering to pages
 *   whose route is or lives under this prefix. Only meaningful in
 *   website mode.
 * @param {Object} [options.adapterOptions] - Caller-supplied adapter
 *   options. Merged on top of whatever the foundation's getOptions
 *   returns, so hosts can override.
 * @param {string} [options.basePath] - DocumentProvider basePath. In
 *   website mode, defaults to `website.basePath` if unset.
 * @returns {Promise<Blob>}
 */
export async function compileDocument(treeOrWebsite, options = {}) {
    const isElement =
        treeOrWebsite !== null &&
        typeof treeOrWebsite === 'object' &&
        // React elements have a $$typeof symbol; duck-typing avoids needing
        // `import { isValidElement } from 'react'` (minor, but keeps this
        // file free of React imports it doesn't otherwise need).
        Boolean(treeOrWebsite.$$typeof)

    if (isElement) {
        const { format, ...rest } = options
        if (!format) {
            throw new Error(
                "compileDocument: 'format' is required (tree mode).",
            )
        }
        return compileSubtree(treeOrWebsite, format, rest)
    }

    const website = treeOrWebsite
    const {
        format,
        foundation,
        rootPath,
        adapterOptions: overrideAdapterOptions = {},
        basePath: basePathOverride,
        ...rest
    } = options

    if (!format) {
        throw new Error(
            "compileDocument: 'format' is required (website mode).",
        )
    }
    if (!website || !Array.isArray(website.pages)) {
        throw new Error(
            'compileDocument: first argument must be either a React element ' +
                '(tree mode) or a Website (website mode: expected object with ' +
                'a pages array).',
        )
    }

    const outputs = resolveFoundationOutputs(foundation)
    const outputSpec = outputs?.[format]
    if (!outputSpec) {
        const declared = outputs ? Object.keys(outputs).join(', ') || '(none)' : '(no outputs declaration)'
        throw new Error(
            `compileDocument: foundation has no outputs.${format} declaration. ` +
                `Declared outputs: ${declared}. ` +
                "Add outputs[format] = { getOptions, extension?, via? } to the foundation's default export.",
        )
    }

    const pressFormat = outputSpec.via ?? format
    const foundationAdapterOptions = outputSpec.getOptions
        ? await outputSpec.getOptions(website, { format, rootPath, ...rest })
        : {}

    const mergedAdapterOptions = {
        ...foundationAdapterOptions.adapterOptions,
        ...overrideAdapterOptions,
    }

    const blocks = gatherBlocks(website, rootPath)
    const renderer = globalThis.uniweb?.childBlockRenderer
    if (typeof renderer !== 'function') {
        throw new Error(
            'compileDocument: globalThis.uniweb.childBlockRenderer is not ' +
                'installed. Either call initPrerender (headless) or mount a ' +
                'Uniweb runtime (browser) before compileDocument, or pass a ' +
                'pre-built tree (tree mode).',
        )
    }
    const tree = renderer({ blocks })

    return compileSubtree(tree, pressFormat, {
        basePath: basePathOverride ?? website?.basePath,
        ...foundationAdapterOptions,
        adapterOptions: mergedAdapterOptions,
    })
}

function resolveFoundationOutputs(foundation) {
    if (!foundation) return null
    if (foundation.outputs) return foundation.outputs
    if (foundation.default?.capabilities?.outputs)
        return foundation.default.capabilities.outputs
    if (foundation.default?.outputs) return foundation.default.outputs
    return null
}

function gatherBlocks(website, rootPath) {
    const pages = website.pages || []
    const scoped =
        rootPath && typeof rootPath === 'string'
            ? pages.filter(
                  (p) =>
                      p.route === rootPath ||
                      (typeof p.route === 'string' &&
                          p.route.startsWith(rootPath + '/')),
              )
            : pages
    return scoped.flatMap((page) => page.bodyBlocks || [])
}

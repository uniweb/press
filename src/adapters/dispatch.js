/**
 * Adapter dispatch — the shared lazy-loading registry used by both
 * useDocumentCompile (live page, single-provider flow) and compileSubtree
 * (off-screen whole-subtree aggregation).
 *
 * Adapters live at src/adapters/*.js and are intentionally NOT listed in
 * package.json's exports field. Callers must go through runCompile(...)
 * so the dynamic-import stays the only path — which is how the ~3.4 MB
 * docx library (and any future WASM runtime) stays out of the main bundle.
 *
 * ## Descriptor shape
 *
 * Each adapter is described by a triple:
 *
 *   { load, consumes, ir }
 *
 *   load     — () => import('./<adapter>.js'). Dynamic-imported only.
 *   consumes — the store key foundations register fragments under. May
 *              differ from the output format name. Paged.js compiles
 *              'pagedjs' output but reads fragments registered under
 *              'html'; future EPUB will do the same. (See principle 6's
 *              "When the generalization is already earned" carve-out in
 *              docs/architecture/principles.md — this split was introduced
 *              with the first HTML-string adapter rather than deferred.)
 *              When omitted, defaults to the format name (self-aliased).
 *   ir       — true for HTML-based adapters that walk each fragment into
 *              the IR tree (docx, typst). false for passthrough adapters
 *              that consume rendered HTML strings (pagedjs) or plain data
 *              objects (xlsx). Drives the compile-pipeline branch in
 *              src/ir/compile.js without per-format if-ladders.
 *
 * Output format names (keys of ADAPTERS) are the public contract — what
 * callers pass to compileSubtree / useDocumentCompile.compile. Input shape
 * names (values of `consumes`) are the contract between the registration
 * store and the adapter; foundations register under these.
 */

/** @type {Record<string, { load: () => Promise<any>, consumes?: string, ir?: boolean }>} */
const ADAPTERS = {
    docx: { load: () => import('./docx.js'), consumes: 'docx', ir: true },
    xlsx: { load: () => import('./xlsx.js'), consumes: 'xlsx', ir: false },
    typst: { load: () => import('./typst.js'), consumes: 'typst', ir: true },
    // Paged.js consumes 'html' — an input shape also targeted by future
    // HTML-string adapters (EPUB). Foundations register once under 'html'.
    pagedjs: { load: () => import('./pagedjs.js'), consumes: 'html', ir: false },
}

/**
 * Look up an adapter descriptor by output-format name. Returns null when
 * the format is unknown — callers decide how to surface that (runCompile
 * throws; compileOutputs warns and returns an empty-shape input).
 */
export function getAdapterDescriptor(format) {
    const desc = ADAPTERS[format]
    if (!desc) return null
    return {
        load: desc.load,
        consumes: desc.consumes || format,
        ir: desc.ir !== false, // default to true for safety on under-specified entries
    }
}

/**
 * Run the format adapter against already-compiled input.
 *
 * @param {string} format - 'docx' | 'xlsx' | 'typst' | 'pagedjs' | …
 * @param {Object} compiledInput - Output of compileOutputs(store, format).
 * @param {Object} [documentOptions] - Adapter-specific options.
 * @returns {Promise<Blob>}
 */
export async function runCompile(format, compiledInput, documentOptions = {}) {
    const desc = getAdapterDescriptor(format)
    if (!desc) {
        throw new Error(`Unsupported document format: "${format}"`)
    }
    const adapter = await desc.load()
    const compileFn =
        adapter.compileDocx ||
        adapter.compileXlsx ||
        adapter.compileTypst ||
        adapter.compilePagedjs ||
        adapter.compilePdf
    if (!compileFn) {
        throw new Error(
            `Format adapter "${format}" does not export a compile function.`,
        )
    }
    return compileFn(compiledInput, documentOptions)
}

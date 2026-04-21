/**
 * Adapter dispatch — the shared lazy-loading registry used by both
 * useDocumentCompile (live page, single-provider flow) and compileSubtree
 * (off-screen whole-subtree aggregation).
 *
 * Adapters live at src/adapters/*.js and are intentionally NOT listed in
 * package.json's exports field. Callers must go through runCompile(...)
 * so the dynamic-import stays the only path — which is how the ~3.4 MB
 * docx library (and any future WASM runtime) stays out of the main bundle.
 */

// Dynamic-import loaders keyed by format. Each loader resolves to a
// module exporting compile<Format>(compiledInput, documentOptions) → Blob.
const ADAPTERS = {
    docx: () => import('./docx.js'),
    xlsx: () => import('./xlsx.js'),
    typst: () => import('./typst.js'),
    // Phase 3: pdf:  () => import('./pdf.js'),
}

/**
 * Run the format adapter against already-compiled input.
 *
 * @param {string} format - 'docx' | 'xlsx' | 'typst' | …
 * @param {Object} compiledInput - Output of compileOutputs(store, format).
 * @param {Object} [documentOptions] - Adapter-specific options.
 * @returns {Promise<Blob>}
 */
export async function runCompile(format, compiledInput, documentOptions = {}) {
    const loader = ADAPTERS[format]
    if (!loader) {
        throw new Error(`Unsupported document format: "${format}"`)
    }
    const adapter = await loader()
    const compileFn =
        adapter.compileDocx ||
        adapter.compileXlsx ||
        adapter.compileTypst ||
        adapter.compilePdf
    if (!compileFn) {
        throw new Error(
            `Format adapter "${format}" does not export a compile function.`,
        )
    }
    return compileFn(compiledInput, documentOptions)
}

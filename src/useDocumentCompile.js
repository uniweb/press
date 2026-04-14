/**
 * Hook that returns a compile function for the current DocumentProvider.
 *
 * Compiles registered outputs for a given format into a Blob. Does not
 * trigger a download — pair with triggerDownload() for that, or hand
 * the blob to a preview renderer (docx-preview, pdf.js, etc.).
 *
 * Usage:
 *
 *   const { compile, isCompiling } = useDocumentCompile()
 *   const handleDownload = async () => {
 *     const blob = await compile('docx', { title: 'Annual Report' })
 *     triggerDownload(blob, 'annual-report.docx')
 *   }
 *
 * The format adapter is loaded via dynamic import the first time compile()
 * is called, so importing this hook does not pull the adapter (or its
 * heavy dependencies) into the initial page bundle.
 */
import { useCallback, useContext, useState } from 'react'
import { DocumentContext } from './DocumentContext.js'
import { compileOutputs } from './ir/compile.js'

// Dynamic-import loaders keyed by format. Each loader resolves to a
// module exporting compile<Format>(compiledInput, documentOptions) → Blob.
const ADAPTERS = {
    docx: () => import('./adapters/docx.js'),
    // Phase 2: xlsx: () => import('./adapters/xlsx.js'),
    // Phase 3: pdf:  () => import('./adapters/pdf.js'),
}

/**
 * @returns {{ compile: (format: string, documentOptions?: Object) => Promise<Blob>, isCompiling: boolean }}
 */
export function useDocumentCompile() {
    const store = useContext(DocumentContext)
    const [isCompiling, setIsCompiling] = useState(false)

    const compile = useCallback(
        async (format, documentOptions = {}) => {
            if (!store) {
                throw new Error(
                    'useDocumentCompile: called outside of a <DocumentProvider>.',
                )
            }
            const adapterLoader = ADAPTERS[format]
            if (!adapterLoader) {
                throw new Error(`Unsupported document format: "${format}"`)
            }

            setIsCompiling(true)
            try {
                const compiled = compileOutputs(store, format)
                const adapter = await adapterLoader()
                const compileFn =
                    adapter.compileDocx ||
                    adapter.compileXlsx ||
                    adapter.compilePdf
                if (!compileFn) {
                    throw new Error(
                        `Format adapter "${format}" does not export a compile function.`,
                    )
                }
                return await compileFn(compiled, documentOptions)
            } finally {
                setIsCompiling(false)
            }
        },
        [store],
    )

    return { compile, isCompiling }
}

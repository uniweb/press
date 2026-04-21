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
import { runCompile } from './adapters/dispatch.js'

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
            setIsCompiling(true)
            try {
                const compiled = compileOutputs(store, format)
                return await runCompile(format, compiled, documentOptions)
            } finally {
                setIsCompiling(false)
            }
        },
        [store],
    )

    return { compile, isCompiling }
}

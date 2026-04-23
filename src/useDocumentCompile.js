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
import { runCompile, getAdapterDescriptor } from './adapters/dispatch.js'

// One-time per-input-key warning guard, shared across every
// useDocumentCompile call in a page. Same behaviour as the off-screen
// compileSubtree pathway — keyed on the adapter's `consumes` input shape,
// not the output format, so a missed 'html' registration warns once total
// even across multiple output formats (pagedjs + future epub) that share it.
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
                ? `compile('${format}') found 0 registered sections. ` +
                  `Did any section component call useDocumentOutput(block, '${format}', ...)?`
                : `compile('${format}') found 0 sections registered under input key '${key}'. ` +
                  `Sections should call useDocumentOutput(block, '${key}', ...) ` +
                  `(the output format '${format}' reads fragments registered under '${key}').`
        console.warn(
            `@uniweb/press: ${note} ` +
                `Sections registered for a different input key do not cross-register.`,
        )
    }
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
            setIsCompiling(true)
            try {
                warnIfEmptyRegistrations(store, format)
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

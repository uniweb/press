/**
 * Convenience button that compiles registered outputs and triggers a
 * browser download.
 *
 * Usage:
 *
 *   <DocumentProvider>
 *     <SectionA block={block1} />
 *     <SectionB block={block2} />
 *     <DownloadButton format="docx" fileName="report.docx" />
 *   </DocumentProvider>
 *
 * Foundations can replace this with their own UI — the compile/download
 * logic is exposed via the useDocumentDownload hook below.
 */

import { useContext, useCallback, useState } from 'react'
import { DocumentContext } from './DocumentContext.js'
import { compileOutputs } from '../orchestrator/compile.js'

// --- Adapter loaders (lazy import) ---

const ADAPTERS = {
    docx: () => import('../docx/index.js'),
    // Phase 2: xlsx: () => import('../xlsx/index.js'),
    // Phase 3: pdf:  () => import('../pdf/index.js'),
}

/**
 * Hook that returns a download function. Use this if you want to build
 * your own download UI instead of using DownloadButton.
 *
 * @param {Object} [options]
 * @param {string} [options.format='docx'] - Output format.
 * @param {string} [options.fileName] - Download file name.
 * @param {Object} [options.documentOptions] - Passed to the adapter
 *   (e.g., { title, creator } for docx metadata).
 * @returns {{ download: () => Promise<void>, isCompiling: boolean }}
 */
export function useDocumentDownload(options = {}) {
    const { format = 'docx', fileName, documentOptions = {} } = options
    const store = useContext(DocumentContext)
    const [isCompiling, setIsCompiling] = useState(false)

    const download = useCallback(async () => {
        if (!store) {
            console.warn('useDocumentDownload: no DocumentProvider found.')
            return
        }

        setIsCompiling(true)
        try {
            // Step 1: Compile registered outputs into adapter input shape
            const compiled = compileOutputs(store, format)

            // Step 2: Lazy-load the format adapter
            const adapterLoader = ADAPTERS[format]
            if (!adapterLoader) {
                throw new Error(`Unsupported document format: "${format}"`)
            }
            const adapter = await adapterLoader()

            // Step 3: Build and pack the document
            const compileFn = adapter.compileDocx || adapter.compileXlsx || adapter.compilePdf
            if (!compileFn) {
                throw new Error(`Format adapter "${format}" does not export a compile function.`)
            }
            const blob = await compileFn(compiled, documentOptions)

            // Step 4: Trigger browser download
            triggerDownload(blob, fileName || `document.${format}`)
        } catch (err) {
            console.error(`Document download failed (${format}):`, err)
            throw err
        } finally {
            setIsCompiling(false)
        }
    }, [store, format, fileName, documentOptions])

    return { download, isCompiling }
}

/**
 * Ready-made download button. Renders a <button> that compiles and
 * downloads the document when clicked.
 *
 * @param {Object} props
 * @param {string} [props.format='docx']
 * @param {string} [props.fileName]
 * @param {Object} [props.documentOptions]
 * @param {React.ReactNode} [props.children] - Button label.
 */
export default function DownloadButton({
    format = 'docx',
    fileName,
    documentOptions,
    children,
    ...buttonProps
}) {
    const { download, isCompiling } = useDocumentDownload({
        format,
        fileName,
        documentOptions,
    })

    return (
        <button
            type="button"
            onClick={download}
            disabled={isCompiling}
            {...buttonProps}
        >
            {isCompiling
                ? 'Generating...'
                : children || `Download ${format.toUpperCase()}`}
        </button>
    )
}

// --- Utility ---

/**
 * Trigger a browser download from a Blob.
 * Falls back to no-op in non-browser environments (SSR, tests).
 */
function triggerDownload(blob, fileName) {
    if (typeof document === 'undefined') return

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

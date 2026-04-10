/**
 * @uniweb/documents/react — React entry point.
 *
 * Foundations import the hook and builder components from here.
 * Sites import the provider and the convenience download button.
 */

// Provider + hook
export { default as DocumentProvider } from './DocumentProvider.jsx'
export { useDocumentOutput } from './useDocumentOutput.js'
export { useDocumentDownload } from './DownloadButton.jsx'
export { DocumentContext } from './DocumentContext.js'

// Download UI
export { default as DownloadButton } from './DownloadButton.jsx'

// Builder components
export { Paragraph, TextRun, H1, H2, H3, H4, Section } from './components/index.js'

// Orchestrator (for advanced use — most consumers use DownloadButton)
export { compileOutputs } from '../orchestrator/compile.js'

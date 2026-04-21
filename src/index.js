/**
 * @uniweb/press — format-agnostic core.
 *
 * The root barrel exports the registration machinery and the compile
 * pipeline — everything a foundation needs to wire sections to the
 * document lifecycle and turn them into a downloadable Blob. React
 * builder components live at '@uniweb/press/docx'; the IR layer for
 * custom-adapter authors lives at '@uniweb/press/ir'.
 */

export { default as DocumentProvider, createStore } from './DocumentProvider.jsx'
export { useDocumentOutput } from './useDocumentOutput.js'
export { useDocumentCompile } from './useDocumentCompile.js'
export { triggerDownload } from './triggerDownload.js'
export {
    compileRegistrations,
    compileSubtree,
} from './compileRegistrations.js'

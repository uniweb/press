/**
 * @uniweb/press — Frontend document generation for Uniweb foundations.
 *
 * Most consumers will import from a subpath:
 *
 *   import { useDocumentOutput, DocumentProvider } from '@uniweb/press/react'
 *   import { compileDocx } from '@uniweb/press/docx'
 *
 * The root export provides the IR utilities (for advanced use) and
 * re-exports the compile orchestrator.
 */

// IR utilities (for advanced use or testing)
export { htmlToIR, attributesToProperties, attributeMap } from './ir/index.js'

// Docx adapter re-export for convenience
export { compileDocx, buildDocument } from './docx/index.js'

/**
 * @uniweb/press — Frontend document generation for Uniweb foundations.
 *
 * Most consumers will import from a subpath:
 *
 *   import { useDocumentOutput, DocumentProvider } from '@uniweb/press/react'
 *   import { compileDocx } from '@uniweb/press/docx'
 *
 * The root export provides the IR utilities (for advanced use).
 * The docx adapter is reachable only via '@uniweb/press/docx' so that the
 * large docx library stays out of consumers that do not call compile().
 */

// IR utilities (for advanced use or testing)
export { htmlToIR, attributesToProperties, attributeMap } from './ir/index.js'

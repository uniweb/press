/**
 * @uniweb/press/ir — IR layer for custom format adapters.
 *
 * Public entry point for authors writing a new format adapter (their own
 * xlsx flavor, a RTF writer, etc.). The IR is a tree of plain objects —
 * no React, no docx dependency — that any adapter can walk and serialize
 * in its own format.
 */

export { htmlToIR } from './parser.js'
export { attributesToProperties, attributeMap, setPath } from './attributes.js'
export { compileOutputs } from './compile.js'

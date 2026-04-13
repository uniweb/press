/**
 * @uniweb/press/sdk — Utilities for document-generating foundations.
 *
 * Provides content instantiation, styled string parsing, and formatting
 * helpers that foundation authors use alongside the builder components.
 */

export { instantiateContent } from './instantiate.js'
export { parseStyledString } from './parseStyledString.js'
export { makeCurrency, makeParentheses, makeRange, join } from './utilities.js'

// Re-export convertMillimetersToTwip from docx for convenience
export { convertMillimetersToTwip } from 'docx'

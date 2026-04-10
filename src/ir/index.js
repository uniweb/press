/**
 * @uniweb/documents IR layer.
 *
 * Not a public entry point — used internally by the docx adapter and
 * the orchestrator. Exported here for testing and advanced use.
 */
export { htmlToIR } from './parser.js'
export { attributesToProperties, attributeMap, setPath } from './attributes.js'

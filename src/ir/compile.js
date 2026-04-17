/**
 * Bridge between the React registration layer (DocumentProvider +
 * useDocumentOutput) and the format adapters (docx, xlsx, pdf).
 *
 * For docx (and any HTML-based format): registered JSX fragments are
 * statically rendered to HTML, parsed to IR, and grouped into
 * { header, footer, sections }.
 *
 * For xlsx: registered data objects are collected as-is (no IR conversion).
 *
 * useDocumentCompile is the typical caller; custom adapter authors can
 * invoke compileOutputs() directly via the @uniweb/press/ir subpath.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { htmlToIR } from './parser.js'
import { BasePathContext } from '../BasePathContext.js'

/**
 * Compile all registered outputs for a given format into the shape the
 * format adapter's compile function expects.
 *
 * @param {Object} store - The DocumentProvider store (from DocumentContext).
 * @param {string} format - Format identifier ('docx', 'xlsx', etc.).
 * @returns {Object} Adapter input shape:
 *   For docx: { sections: IR[][], header: IR[]|null, footer: IR[]|null }
 *   For xlsx: { sections: Object[] } (raw data objects)
 */
export function compileOutputs(store, format) {
    const outputs = store.getOutputs(format)

    if (format === 'xlsx') {
        return compileXlsx(outputs)
    }

    // Default: HTML-based formats (docx, pdf)
    return compileHtmlBased(outputs, store.basePath || '')
}

/**
 * Compile HTML-based format outputs (docx, pdf).
 * JSX fragments → renderToStaticMarkup → htmlToIR → grouped by role.
 *
 * Registered fragments are React element trees captured during the live
 * page render. renderToStaticMarkup renders them afresh here, outside
 * the React tree the page rendered in — so any context the builders
 * read (notably BasePathContext, used by <Image> / <Figure> to resolve
 * site-absolute URLs under subdirectory deployments) must be
 * re-provided now or builders would see default values and emit
 * un-prefixed URLs that the docx adapter's fetch() then 404s on.
 */
function compileHtmlBased(outputs, basePath) {
    let header = null
    let footer = null
    const sections = []

    for (const { fragment, options } of outputs) {
        const wrapped = basePath
            ? createElement(BasePathContext.Provider, { value: basePath }, fragment)
            : fragment
        const html = renderToStaticMarkup(wrapped)
        const ir = htmlToIR(html)

        const role = options.role || 'body'

        switch (role) {
            case 'header':
                // Last header wins (or merge — for now, last wins).
                header = ir
                break
            case 'footer':
                footer = ir
                break
            default:
                sections.push(ir)
                break
        }
    }

    return { sections, header, footer }
}

/**
 * Compile xlsx format outputs. Fragments are plain data objects
 * (no HTML/IR conversion needed).
 */
function compileXlsx(outputs) {
    const sections = outputs
        .map(({ fragment }) => fragment)
        .filter(Boolean)

    return { sections }
}

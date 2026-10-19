/**
 * Test harness for the professional-invoice plan stages.
 *
 * Two helpers used across stages 0-5:
 *
 *   compileInvoice(jsx, options)
 *     Pipes a JSX fragment through the production compile pipeline
 *     (renderToStaticMarkup -> htmlToIR -> buildDocument -> Packer.toBuffer)
 *     and returns { buffer, zip, documentXml }. Avoids re-implementing the
 *     plumbing in every stage's test.
 *
 *   verifyDocx(buffer)
 *     Asserts the three Word-clean invariants from this package's CLAUDE.md
 *     so any regression on those is loud:
 *       1. Every <wp:docPr> id is unique across the document.
 *       2. Every <wp:docPr> emits a `name=""` attribute.
 *       3. No file in word/media/ has a .undefined extension.
 *     Returns { docPrIds, mediaFiles } so callers can make additional
 *     stage-specific assertions on the same parse.
 *
 * The harness is `.js` (not `.test.js`) so vitest doesn't pick it up
 * directly — fixtures import from it.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Packer } from 'docx'
import JSZip from 'jszip'
import { htmlToIR } from '../../../src/ir/parser.js'
import { buildDocument } from '../../../src/adapters/docx.js'
import DocumentProvider from '../../../src/DocumentProvider.jsx'

/**
 * Compile a JSX fragment all the way to a docx buffer.
 *
 * Accepts an optional `header` / `footer` JSX in the options bag — those
 * get walked through the same IR pipeline and lifted into the docx
 * Section's headers/footers slots, mirroring how
 * `useDocumentOutput(block, 'docx', body, { role: 'header' })` flows
 * through `compileToIR` in production. `headerFirstPageOnly` and
 * `footerFirstPageOnly` flags are forwarded as well.
 *
 * @param {React.ReactNode} jsx - The body fragment to compile.
 * @param {Object} [options] - Forwarded to buildDocument. Special keys:
 *   - `header` (JSX): becomes the page header.
 *   - `footer` (JSX): becomes the page footer.
 *   - `headerFirstPageOnly` (boolean): differentiated first-page header.
 *   - `footerFirstPageOnly` (boolean): differentiated first-page footer.
 *   All other keys (title, pageMargin, pageSize, pageOrientation, ...)
 *   pass through to buildDocument's options bag.
 * @returns {Promise<{ buffer: Buffer, zip: JSZip, documentXml: string }>}
 */
export async function compileInvoice(jsx, options = {}) {
    const {
        header,
        footer,
        headerFirstPageOnly = false,
        footerFirstPageOnly = false,
        theme,
        ...documentOptions
    } = options

    // When the caller passes a theme, every render goes through a
    // DocumentProvider so theme-aware builders (TextRun color, Td
    // shading, table borders) can resolve theme keys. Without a theme,
    // builders fall back to DEFAULT_THEME and emit literal hex values
    // — preserving the pre-Stage-5 behavior for older fixtures.
    const renderHtml = (node) =>
        renderToStaticMarkup(
            theme ? <DocumentProvider theme={theme}>{node}</DocumentProvider> : node,
        )

    const sectionIr = htmlToIR(renderHtml(jsx))

    const input = { sections: [sectionIr] }
    if (header) {
        input.header = htmlToIR(renderHtml(header))
        input.headerFirstPageOnly = headerFirstPageOnly
    }
    if (footer) {
        input.footer = htmlToIR(renderHtml(footer))
        input.footerFirstPageOnly = footerFirstPageOnly
    }

    const doc = await buildDocument(input, documentOptions)
    const buffer = await Packer.toBuffer(doc)
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml').async('string')
    return { buffer, zip, documentXml }
}

/**
 * Read every part of a compiled docx that we routinely inspect — saves
 * tests from poking at jszip directly when they want headers, footers, or
 * numbering.
 *
 * @param {JSZip} zip
 * @returns {Promise<{ documentXml: string, headerXmls: string[], footerXmls: string[], numberingXml: string|null, contentTypesXml: string }>}
 */
export async function readDocxParts(zip) {
    const documentXml = await zip.file('word/document.xml').async('string')
    const numbering = zip.file('word/numbering.xml')
    const numberingXml = numbering ? await numbering.async('string') : null
    const contentTypesXml = await zip.file('[Content_Types].xml').async('string')

    const headerXmls = []
    const footerXmls = []
    for (const name of Object.keys(zip.files)) {
        if (/^word\/header\d+\.xml$/.test(name)) {
            headerXmls.push(await zip.file(name).async('string'))
        }
        if (/^word\/footer\d+\.xml$/.test(name)) {
            footerXmls.push(await zip.file(name).async('string'))
        }
    }
    return { documentXml, headerXmls, footerXmls, numberingXml, contentTypesXml }
}

/**
 * Assert the three Word-clean invariants. Each violation throws with a
 * specific message so test output points at the right invariant.
 *
 * Returns the data inspected so callers can layer stage-specific
 * assertions on top without re-parsing.
 *
 * @param {Buffer} buffer - Output of compileInvoice() or Packer.toBuffer().
 * @returns {Promise<{ docPrIds: string[], mediaFiles: string[] }>}
 */
export async function verifyDocx(buffer) {
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml').async('string')

    // Invariant 1: unique <wp:docPr id="…"> across the document.
    const docPrIds = []
    const docPrPattern = /<wp:docPr\b[^>]*\bid="([^"]*)"/g
    let m
    while ((m = docPrPattern.exec(documentXml)) !== null) {
        docPrIds.push(m[1])
    }
    const seen = new Set()
    const dupes = []
    for (const id of docPrIds) {
        if (seen.has(id)) dupes.push(id)
        seen.add(id)
    }
    if (dupes.length) {
        throw new Error(
            `verifyDocx invariant #1: duplicate <wp:docPr id> values: ${dupes.join(', ')}`,
        )
    }

    // Invariant 2: every <wp:docPr> emits a name attribute.
    const allDocPr = documentXml.match(/<wp:docPr\b[^>]*\/?>/g) || []
    const missingName = allDocPr.filter((tag) => !/\bname="/.test(tag))
    if (missingName.length) {
        throw new Error(
            `verifyDocx invariant #2: <wp:docPr> tags missing name attribute (${missingName.length}). ` +
                `First offender: ${missingName[0]}`,
        )
    }

    // Invariant 3: no .undefined files in word/media/.
    const mediaFiles = Object.keys(zip.files).filter((p) =>
        p.startsWith('word/media/'),
    )
    const undefinedExt = mediaFiles.filter((p) => /\.undefined$/.test(p))
    if (undefinedExt.length) {
        throw new Error(
            `verifyDocx invariant #3: word/media/ contains .undefined files: ${undefinedExt.join(', ')}`,
        )
    }

    return { docPrIds, mediaFiles }
}

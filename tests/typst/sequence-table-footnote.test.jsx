/**
 * What a sequence reaches print with: a table, which it used to drop without a word, and a
 * footnote. Asserted on the compiled source, in both lanes the walker feeds.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { htmlToIR } from '../../src/ir/parser.js'
import { buildBundle as buildTypst } from '../../src/adapters/typst.js'
import { buildBundle as buildLatex } from '../../src/adapters/latex.js'
import { Sequence, Paragraph, footnoteMarker } from '../../src/typst/index.js'
import { Paragraph as DocxParagraph } from '../../src/docx/index.js'
import { parseStyledString } from '../../src/docx/parseStyledString.js'

const ir = (element) => htmlToIR(ReactDOMServer.renderToStaticMarkup(element))
const typst = (element) => buildTypst({ sections: [ir(element)], metadata: null })['content.typ']
const latex = (element) => buildLatex({ sections: [ir(element)], metadata: null })['content.tex']

const cell = (text, header = false) => ({
    children: [{ type: 'paragraph', text, children: [] }],
    header,
    align: null,
    colspan: 1,
    rowspan: 1,
})

const TABLE = {
    type: 'table',
    rows: [
        { cells: [cell('Year', true), cell('Count', true)] },
        { cells: [cell('2025'), cell('<strong>12</strong>')] },
    ],
}

describe('a table in a sequence', () => {
    it('reaches Typst, its header strong and its cells in order', () => {
        const src = typst(<Sequence data={[{ type: 'paragraph', text: 'Before.' }, TABLE]} />)
        expect(src).toContain('Before.')
        expect(src).toMatch(/#table\(\s*columns: 2,/)
        expect(src).toContain('[#strong[Year]]')
        expect(src).toContain('[#strong[Count]]')
        expect(src).toContain('[2025]')
        expect(src).toContain('[#strong[12]]')
        expect(src.indexOf('Year')).toBeLessThan(src.indexOf('2025'))
    })

    it('reaches LaTeX', () => {
        const src = latex(<Sequence data={[TABLE]} />)
        expect(src).toContain('\\begin{tabular}{ll}')
        expect(src).toContain('\\textbf{Year} & \\textbf{Count} \\\\')
        expect(src).toContain('2025 & \\textbf{12} \\\\')
    })

    it('counts its columns from its widest row', () => {
        const src = typst(
            <Sequence data={[{ type: 'table', rows: [{ cells: [cell('a')] }, { cells: [cell('b'), cell('c'), cell('d')] }] }]} />,
        )
        expect(src).toMatch(/columns: 3,/)
    })

    it('is nothing when it has no rows', () => {
        expect(typst(<Sequence data={[{ type: 'table', rows: [] }]} />)).not.toContain('#table')
    })
})

describe('a footnote in a styled string', () => {
    const note = 'A note with <em>emphasis</em> &amp; a &quot;quote&quot;.'
    const text = `Words.${footnoteMarker(note)} More.`

    it('parses as a footnote part holding the note as written', () => {
        const parts = parseStyledString(text)
        expect(parts.map((p) => p.type)).toEqual(['text', 'footnote', 'text'])
        expect(parts[1].content).toBe(note)
    })

    it('reaches Typst at its place, its marks kept', () => {
        const src = typst(<Paragraph data={text} />)
        expect(src).toContain('Words.#footnote[A note with #emph[emphasis] & a "quote".] More.')
    })

    it('reaches LaTeX at its place', () => {
        const src = latex(<Paragraph data={text} />)
        expect(src).toContain('Words.\\footnote{A note with \\emph{emphasis} \\& a ')
        expect(src).toMatch(/\} More\./)
    })

    it('reaches a Word document as its own footnote', () => {
        const node = ir(<DocxParagraph data={text} />)
        expect(JSON.stringify(node)).toContain('"type":"footnoteReference"')
    })
})

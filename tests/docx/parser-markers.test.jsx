/**
 * The parser's positional markers never reach a document as text.
 *
 * `@uniweb/semantic-parser` leaves a marker in a paragraph's HTML for an inline
 * atom a renderer draws with a component: an inset (`<uniweb-inset …>`), an icon
 * (`<uniweb-icon …>`) and, since 2026-10-18, a picture beside text
 * (`<uniweb-image …>`). These builders draw none of them, and parseStyledString's
 * tag pattern cannot match one — `\w+` stops at the hyphen, and a marker is
 * empty — so until 2026-10-18 it fell through as plain text, and Word showed
 * `<uniweb-icon data-index="0"></uniweb-icon>` in the middle of the sentence.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { parseStyledString } from '../../src/docx/parseStyledString.js'
import { Paragraph } from '../../src/docx/index.js'
import { Paragraph as TypstParagraph } from '../../src/typst/index.js'
import { htmlToIR } from '../../src/ir/parser.js'
import { buildBundle } from '../../src/adapters/typst.js'
import { compileInvoice } from '../integration/invoice-fixtures/_harness.jsx'

const icon = '<uniweb-icon data-index="0"></uniweb-icon>'
const picture = '<uniweb-image data-index="0"></uniweb-image>'
const inset = '<uniweb-inset data-ref-id="inset_0"></uniweb-inset>'

describe('a parser marker in a styled string', () => {
    it.each([
        ['an icon', icon],
        ['a picture', picture],
        ['an inset', inset],
    ])("drops %s's marker and keeps the text around it", (_, marker) => {
        expect(parseStyledString(`Before ${marker} after.`)).toEqual([
            { type: 'text', content: 'Before  after.' },
        ])
    })

    it('drops a marker inside a mark and keeps the mark', () => {
        expect(parseStyledString(`<strong>Bold ${picture}</strong> plain`)).toEqual([
            { type: 'text', content: 'Bold ', bold: true },
            { type: 'text', content: ' plain' },
        ])
    })
})

describe('in a compiled document', () => {
    it('Word shows no marker as text', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph data={`Home ${icon} sweet ${picture} home.`} />,
        )
        expect(documentXml).toMatch(/Home {2}sweet {2}home\./)
        expect(documentXml).not.toMatch(/uniweb-/)
    })

    it('Typst source carries no marker', () => {
        const html = ReactDOMServer.renderToStaticMarkup(
            <TypstParagraph data={`Home ${icon} sweet ${picture} home.`} />,
        )
        const src = buildBundle({ sections: [htmlToIR(html)], metadata: null })['content.typ']
        expect(src).toContain('sweet')
        expect(src).not.toMatch(/uniweb-/)
    })
})

/**
 * ⭐ Subscript, superscript and struck text reach every document (2026-11-17). The parser writes
 * `<sub>`, `<sup>` and `<s>` for the vocabulary's marks, and a CV keeps CO₂ and m² in Word, in a PDF
 * through Typst and in LaTeX — asserted on what each format compiles to, not on parts or IR.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import JSZip from 'jszip'
import { Packer } from 'docx'
import { htmlToIR } from '../../src/ir/parser.js'
import { buildDocument } from '../../src/adapters/docx.js'
import { buildBundle as typstBundle } from '../../src/adapters/typst.js'
import { buildBundle as latexBundle } from '../../src/adapters/latex.js'
import { Paragraph as WordParagraph, H2 as WordHeading } from '../../src/docx/index.js'
import { Paragraph as TypstParagraph, Heading as TypstHeading } from '../../src/typst/index.js'

const TEXT = 'CO<sub>2</sub> in m<sup>2</sup>, <s>gone</s>, <u>under</u>'
const LINKED = 'See <a href="https://x.test">note<sup>1</sup></a>.'

async function documentXml(element) {
    const doc = await buildDocument({ sections: [htmlToIR(ReactDOMServer.renderToStaticMarkup(element))] })
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc))
    return zip.file('word/document.xml').async('string')
}
const typst = (element) => typstBundle({ sections: [htmlToIR(ReactDOMServer.renderToStaticMarkup(element))], metadata: null })['content.typ']
const latex = (element) => latexBundle({ sections: [htmlToIR(ReactDOMServer.renderToStaticMarkup(element))], metadata: null })['content.tex']

/** Each run of a Word paragraph: its text, and the formatting it carries. */
const wordRuns = (xml) =>
    [...xml.matchAll(/<w:r>(?:<w:rPr>(.*?)<\/w:rPr>)?<w:t(?: [^>]*)?>([^<]*)<\/w:t><\/w:r>/g)].map(([, props = '', text]) => [
        text,
        [
            /<w:strike\/>/.test(props) && 'strike',
            /<w:vertAlign w:val="subscript"\/>/.test(props) && 'sub',
            /<w:vertAlign w:val="superscript"\/>/.test(props) && 'super',
            /<w:u /.test(props) && 'underline',
        ].filter(Boolean),
    ])

describe('in Word', () => {
    it('⭐ a paragraph keeps each, run by run', async () => {
        expect(wordRuns(await documentXml(<WordParagraph data={TEXT} />))).toEqual([
            ['CO', []],
            ['2', ['sub']],
            [' in m', []],
            ['2', ['super']],
            [', ', []],
            ['gone', ['strike']],
            [', ', []],
            ['under', ['underline']],
        ])
    })

    it('a heading and a link keep them too', async () => {
        expect(wordRuns(await documentXml(<WordHeading data={'CO<sub>2</sub> and <s>x</s>'} />))).toEqual(
            expect.arrayContaining([['2', ['sub']], ['x', ['strike']]]),
        )
        expect(await documentXml(<WordParagraph data={LINKED} />)).toMatch(/<w:hyperlink [^>]*>.*<w:vertAlign w:val="superscript"\/>.*<w:t[^>]*>1<\/w:t>.*<\/w:hyperlink>/s)
    })
})

describe('in a PDF, through Typst', () => {
    it('⭐ a paragraph writes each', () => {
        const src = typst(<TypstParagraph data={TEXT} />)
        expect(src).toContain('CO#sub[2] in m#super[2], #strike[gone], #underline[under]')
    })

    it('a heading and a link write them too', () => {
        expect(typst(<TypstHeading level={2} data={'CO<sub>2</sub>'} />)).toContain('CO#sub[2]')
        expect(typst(<TypstParagraph data={LINKED} />)).toContain('#link("https://x.test")[note#super[1]]')
    })
})

describe('in LaTeX', () => {
    it('⭐ subscript and superscript are the kernel\'s own commands', () => {
        const src = latex(<TypstParagraph data={TEXT} />)
        expect(src).toContain('CO\\textsubscript{2} in m\\textsuperscript{2}')
    })
})

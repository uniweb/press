/**
 * End-to-end verification: compile a representative fragment that
 * matches the monograph template's shape (numbered headings, bulleted
 * list via numbering-reference, pct-width table) and confirm the
 * resulting docx passes Word's common validation rules:
 *
 *   - No table cell emits `w:w="NN%"` (OOXML expects fiftieths as a
 *     plain number).
 *   - numbering.xml contains the same number of <w:abstractNum> and
 *     <w:num> elements — no orphaned abstracts the library auto-
 *     created via a bullet-shortcut.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Packer } from 'docx'
import JSZip from 'jszip'
import { htmlToIR } from '../../src/ir/parser.js'
import { buildDocument } from '../../src/adapters/docx.js'
import {
    Paragraph,
    Table,
    Tr,
    Td,
} from '../../src/docx/index.js'

// A minimal style pack that matches what the monograph template passes
// to compile(). Only the references that the fragment uses need to be
// defined — the test is about output shape, not style fidelity.
const STYLE_PACK = {
    paragraphStyles: [],
    numbering: [
        {
            reference: 'heading-numbering',
            levels: [
                { level: 0, format: 'decimal', text: '%1.', alignment: 'start' },
                { level: 1, format: 'decimal', text: '%1.%2', alignment: 'start' },
            ],
        },
        {
            reference: 'bullet-list',
            levels: [
                { level: 0, format: 'bullet', text: '\u2022', alignment: 'start' },
            ],
        },
    ],
}

async function compile(fragment) {
    const html = renderToStaticMarkup(fragment)
    const ir = htmlToIR(html)
    const doc = await buildDocument({ sections: [ir] }, STYLE_PACK)
    const buffer = await Packer.toBuffer(doc)
    const zip = await JSZip.loadAsync(buffer)
    return {
        documentXml: await zip.file('word/document.xml').async('string'),
        numberingXml: await zip.file('word/numbering.xml').async('string'),
        size: buffer.length,
    }
}

describe('monograph compile-time validation', () => {
    it('emits OOXML-conformant cell widths and a clean numbering.xml', async () => {
        const fragment = (
            <>
                <Paragraph
                    as="h1"
                    data="Approach to the Archipelago"
                    data-heading="HEADING_1"
                    data-numbering-reference="heading-numbering"
                    data-numbering-level={0}
                />
                <Paragraph data="Opening prose with <strong>inline marks</strong>." />
                <Paragraph
                    data="A bulleted item."
                    data-numbering-reference="bullet-list"
                    data-numbering-level={0}
                />
                <Paragraph
                    data="Another bulleted item."
                    data-numbering-reference="bullet-list"
                    data-numbering-level={0}
                />
                <Paragraph
                    as="h2"
                    data="A subsection"
                    data-heading="HEADING_2"
                    data-numbering-reference="heading-numbering"
                    data-numbering-level={1}
                />
                <Table widths={[18, 28, 12, 42]} borderColor="c9bfae">
                    <Tr header>
                        <Td>Island</Td>
                        <Td>Species</Td>
                        <Td>Count</Td>
                        <Td>Notes</Td>
                    </Tr>
                    <Tr>
                        <Td>Española</Td>
                        <Td>Chelonoidis hoodensis</Td>
                        <Td>3</Td>
                        <Td>Saddleback.</Td>
                    </Tr>
                </Table>
            </>
        )

        const { documentXml, numberingXml, size } = await compile(fragment)

        // Valid docx envelope is implied by Packer success; size should
        // be realistic (at least a few KB for our content).
        expect(size).toBeGreaterThan(4000)

        // No literal "%" in table cell widths.
        const pctWithPercent = documentXml.match(/w:w="\d+%"/g) || []
        expect(pctWithPercent).toEqual([])

        // Each declared width should appear in its fiftieths form.
        expect(documentXml).toMatch(/w:type="pct" w:w="900"/) // 18 * 50
        expect(documentXml).toMatch(/w:type="pct" w:w="1400"/) // 28 * 50
        expect(documentXml).toMatch(/w:type="pct" w:w="600"/) // 12 * 50
        expect(documentXml).toMatch(/w:type="pct" w:w="2100"/) // 42 * 50

        // No orphan abstractNum — every <w:abstractNum> should be paired
        // with a <w:num> mapping.
        const abstractNums = (numberingXml.match(/<w:abstractNum /g) || []).length
        const nums = (numberingXml.match(/<w:num /g) || []).length
        expect(abstractNums).toBeGreaterThan(0)
        expect(abstractNums).toBe(nums)
    })
})

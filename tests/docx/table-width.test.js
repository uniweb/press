/**
 * Verifies that percentage-width table cells emit OOXML-conformant
 * `w:w` values (fiftieths of a percent) instead of the docx library's
 * default `"${n}%"` serialisation, which Word flags on open.
 *
 * The underlying workaround: the adapter multiplies pct sizes by 50
 * and passes them as strings so the docx library's universal-measure
 * path emits a plain integer. See src/adapters/docx.js:toTableCellWidth.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { Packer } from 'docx'
import { buildDocument } from '../../src/adapters/docx.js'

async function compileAndExtractDocumentXml(sections) {
    const doc = await buildDocument({ sections })
    const buffer = await Packer.toBuffer(doc)
    const zip = await JSZip.loadAsync(buffer)
    return zip.file('word/document.xml').async('string')
}

describe('table cell widths', () => {
    it('emits fiftieths-of-percent values for pct widths (not "N%")', async () => {
        // A minimal IR table with two cells declaring 40% and 60%.
        const ir = [
            [
                {
                    type: 'table',
                    children: [
                        {
                            type: 'tableRow',
                            children: [
                                {
                                    type: 'tableCell',
                                    width: { size: '40', type: 'pct' },
                                    children: [
                                        { type: 'paragraph', children: [{ type: 'text', content: 'A' }] },
                                    ],
                                },
                                {
                                    type: 'tableCell',
                                    width: { size: '60', type: 'pct' },
                                    children: [
                                        { type: 'paragraph', children: [{ type: 'text', content: 'B' }] },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        ]

        const xml = await compileAndExtractDocumentXml(ir)

        // 40% should become w:w="2000" (40 * 50), 60% → w:w="3000".
        expect(xml).toMatch(/<w:tcW\s+w:type="pct"\s+w:w="2000"/)
        expect(xml).toMatch(/<w:tcW\s+w:type="pct"\s+w:w="3000"/)

        // No cell should emit a literal "%" — that's the non-conformant
        // form Word repairs.
        const pctPercentSign = xml.match(/w:w="\d+%"/g)
        expect(pctPercentSign).toBeNull()
    })

    it('keeps dxa widths as plain numbers', async () => {
        const ir = [
            [
                {
                    type: 'table',
                    children: [
                        {
                            type: 'tableRow',
                            children: [
                                {
                                    type: 'tableCell',
                                    width: { size: '2880', type: 'dxa' },
                                    children: [
                                        { type: 'paragraph', children: [{ type: 'text', content: 'A' }] },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        ]

        const xml = await compileAndExtractDocumentXml(ir)
        expect(xml).toMatch(/<w:tcW\s+w:type="dxa"\s+w:w="2880"/)
    })
})

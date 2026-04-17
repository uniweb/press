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
    Figure,
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
        relsXml: await zip.file('word/_rels/document.xml.rels').async('string'),
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

describe('positional tab nesting', () => {
    it('wraps <w:ptab> inside <w:r>, not as a bare paragraph child', async () => {
        // Two-column header pattern used by PageBranding / DocxFooter.
        const fragment = (
            <Paragraph>
                <span data-type="text" data-bold="true">Left</span>
                <span
                    data-type="text"
                    data-positionaltab-alignment="right"
                    data-positionaltab-relativeto="margin"
                    data-positionaltab-leader="none"
                />
                <span data-type="text" data-italics="true">Right</span>
            </Paragraph>
        )

        const { documentXml } = await compile(fragment)
        // <w:ptab> must live inside <w:r>. Check that every occurrence
        // has an <w:r> open tag before it with no </w:r> in between.
        const matches = [...documentXml.matchAll(/<w:ptab [^>]*\/>/g)]
        expect(matches.length).toBeGreaterThan(0)
        for (const m of matches) {
            const prefix = documentXml.slice(0, m.index)
            const lastOpen = prefix.lastIndexOf('<w:r>')
            const lastClose = prefix.lastIndexOf('</w:r>')
            expect(lastOpen).toBeGreaterThan(-1)
            expect(lastOpen).toBeGreaterThan(lastClose)
        }
    })
})

describe('drawing IDs are unique per document', () => {
    it('assigns distinct <wp:docPr id="..."> to every image', async () => {
        // Stub fetch so the adapter doesn't need real images.
        const origFetch = globalThis.fetch
        globalThis.fetch = async () => ({
            ok: true,
            status: 200,
            arrayBuffer: async () =>
                // 1x1 transparent PNG
                new Uint8Array([
                    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
                    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
                    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
                    0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
                    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
                    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
                    0x42, 0x60, 0x82,
                ]).buffer,
        })
        try {
            const fragment = (
                <>
                    <Figure src="/a.png" alt="a" width={100} height={100} />
                    <Figure src="/b.png" alt="b" width={100} height={100} />
                    <Figure src="/c.png" alt="c" width={100} height={100} />
                </>
            )
            const { documentXml } = await compile(fragment)
            const ids = documentXml.match(/<wp:docPr [^>]*id="(\d+)"/g) || []
            expect(ids.length).toBe(3)
            const idValues = ids.map((m) => m.match(/id="(\d+)"/)[1])
            expect(new Set(idValues).size).toBe(3)
        } finally {
            globalThis.fetch = origFetch
        }
    })

    it('emits <wp:docPr name="..."/> so Word-for-Mac accepts the file', async () => {
        // Word-for-Mac refuses to open a .docx whose <wp:docPr> is missing
        // the required `name` attribute. The docx library only defaults
        // name to '' when altText is entirely undefined, so any partial
        // altText we pass (e.g. { id, description }) must also carry name.
        const origFetch = globalThis.fetch
        globalThis.fetch = async () => ({
            ok: true,
            status: 200,
            arrayBuffer: async () =>
                new Uint8Array([
                    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
                    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
                    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
                    0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
                    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
                    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
                    0x42, 0x60, 0x82,
                ]).buffer,
        })
        try {
            const fragment = <Figure src="/a.png" alt="a" width={100} height={100} />
            const { documentXml, relsXml } = await compile(fragment)

            const docPrMatches = documentXml.match(/<wp:docPr [^/]*\/>/g) || []
            expect(docPrMatches.length).toBe(1)
            expect(docPrMatches[0]).toMatch(/\sname="[^"]*"/)

            // And the adapter should have written the media file with a
            // real extension (so [Content_Types].xml's Default mapping
            // resolves it), not as `.undefined`.
            expect(relsXml).toContain('.png"')
            expect(relsXml).not.toContain('.undefined"')
        } finally {
            globalThis.fetch = origFetch
        }
    })
})
